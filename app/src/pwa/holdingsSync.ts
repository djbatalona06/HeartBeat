import { db, loadSettings, saveSettings } from '../db/database';
import {
  HOLDING_KINDS, highWaterAfter, mineToPush, pendingSince, shouldApply,
  type HoldingKind, type HoldingRow, type PulledHolding, type WireHolding,
} from '../domain/sync/holdings';

/**
 * The RPG layer's round trip.
 *
 * `sync.ts` carries everything keyed by a *day*. This carries everything keyed
 * by a *row* — gear inventory, hatched companions, the coin-and-XP sheet,
 * tasks, the weekly quest, and the life events and cheers behind the feed —
 * which had no server table at all until now, so
 * reinstalling the app or recovering onto a new phone brought back a couple's
 * whole history and none of their possessions.
 *
 * A separate round trip rather than more kinds in `sync.ts`, because the two
 * are keyed differently all the way down: `/api/entries` is unique on
 * `(member, kind, day)` and none of these rows has a day. Bolting a
 * dayless kind onto that endpoint would mean either a fake day or a second
 * uniqueness rule inside one table, and both are worse than a second table.
 *
 * All the arithmetic — what to send, what to apply, where the watermark goes —
 * lives in `domain/sync/holdings.ts` and is tested there. This is the Dexie and
 * the fetch.
 */

/** Matches `MAX_WRITE` in the endpoint, which bounds one statement batch. */
const PUSH_CHUNK = 200;

/** Which local store each kind lives in. */
function storeFor(kind: HoldingKind) {
  switch (kind) {
    case 'inventory': return db.inventory;
    case 'pet': return db.pets;
    case 'avatar': return db.avatars;
    case 'quest': return db.quests;
    case 'task': return db.tasks;
    case 'lifeEvent': return db.lifeEvents;
    case 'cheer': return db.cheers;
  }
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

/**
 * Everything of ours that has changed since the watermark.
 *
 * Two reads that cannot use the member index, for different reasons. Quests
 * belong to the couple, so there is no member to filter on. Life events have a
 * writer the index does not know about: a Good Vibe's `memberId` is who
 * *receives* it, and only `fromMemberId` says who wrote it, so the rows this
 * device may offer are not the rows any one index returns. Both are read whole
 * — a handful of rows a day either way — and then filtered.
 *
 * `mineToPush` is what actually decides, for every kind alike. Offering a
 * partner's row would push their possessions up under our own member id, which
 * the endpoint refuses silently: the upsert's member check fails, nothing
 * changes, and the row still counts itself as written.
 */
async function collectPending(memberId: string, since: number): Promise<WireHolding[]> {
  const out: WireHolding[] = [];
  for (const kind of HOLDING_KINDS) {
    const rows = kind === 'quest'
      ? await db.quests.toArray()
      : kind === 'lifeEvent'
        ? await db.lifeEvents.toArray()
        : kind === 'avatar'
          ? await db.avatars.where('memberId').equals(memberId).toArray()
          : await storeFor(kind).where('memberId').equals(memberId).toArray();
    const mine = mineToPush(kind, rows as HoldingRow[], memberId);
    out.push(...pendingSince(kind, mine, since));
  }
  return out;
}

function chunk<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

interface PushResult {
  written: number;
  refused: string[];
}

async function push(token: string, rows: WireHolding[]): Promise<PushResult> {
  const res = await fetch('/api/holdings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ rows }),
  });
  // 400 and 413 are the server saying "never", not "not now" — the same
  // distinction `sync.ts` draws, and for the same reason: retrying a row that
  // will never be accepted wedges everything queued behind it. Anything else
  // throws, and the watermark stays put.
  if (res.status === 400 || res.status === 413) {
    return { written: 0, refused: rows.map((r) => r.id) };
  }
  if (!res.ok) throw new Error(`holdings push failed: ${res.status}`);
  const body = (await res.json()) as {
    written?: number;
    rejected?: Array<{ id: string }>;
  };
  return {
    written: body.written ?? 0,
    refused: (body.rejected ?? []).map((r) => r.id),
  };
}

async function pull(token: string, since: number): Promise<{
  rows: PulledHolding[];
  cursor: number;
  more: boolean;
}> {
  const res = await fetch(`/api/holdings?since=${encodeURIComponent(String(since))}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`holdings pull failed: ${res.status}`);
  const body = (await res.json()) as {
    rows?: PulledHolding[];
    cursor?: number;
    more?: boolean;
  };
  return { rows: body.rows ?? [], cursor: body.cursor ?? since, more: !!body.more };
}

/**
 * Write what arrived, where `shouldApply` says to.
 *
 * The ownership check inside `shouldApply` is doing real work here and is not
 * belt-and-braces: the pull is a whole-couple feed by design, so a partner's
 * rows arrive on every sync, legitimately. Applying them would have each phone
 * overwrite its own possessions with the other's on every round trip.
 */
export async function applyPulled(rows: readonly PulledHolding[]): Promise<number> {
  let applied = 0;
  for (const row of rows) {
    const store = storeFor(row.kind);
    if (!store) continue;
    const local = (await store.get(row.id as never)) as HoldingRow | undefined;
    if (!shouldApply(row, local)) continue;
    await store.put(row.payload as never);
    applied += 1;
  }
  return applied;
}

export interface HoldingsSyncResult {
  pushed: number;
  pulled: number;
  applied: number;
  skipped: number;
  more: boolean;
}

/**
 * One round trip. Null when the device is not paired, which is not an error —
 * it is the state every device starts in, and the whole point of this table is
 * that it belongs to a couple.
 */
export async function syncHoldings(): Promise<HoldingsSyncResult | null> {
  const settings = await loadSettings();
  const token = settings.workerSecret;
  const memberId = settings.memberId;
  if (!token || !memberId) return null;

  const pushedAt = settings.holdingsPushedAt ?? 0;
  const pending = await collectPending(memberId, pushedAt);

  let refused = 0;
  for (const part of chunk(pending, PUSH_CHUNK)) {
    refused += (await push(token, part)).refused.length;
  }

  const { rows, cursor, more } = await pull(token, settings.holdingsPulledAt ?? 0);
  const applied = await applyPulled(rows);

  await saveSettings({
    holdingsPushedAt: highWaterAfter(pushedAt, pending, rows),
    holdingsPulledAt: cursor,
  });

  return { pushed: pending.length - refused, pulled: rows.length, applied, skipped: refused, more };
}
