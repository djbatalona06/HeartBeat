/**
 * The sync client.
 *
 * Every screen renders from IndexedDB and never waits on the network. This is
 * the one thing that reconciles that local record with the other phone's: push
 * what changed here, pull what changed there, and let the newer edit win.
 *
 * Last-write-wins is right for this data because a row is one person's account
 * of one of their own days — the two halves of the couple are not editing the
 * same row, so the conflicts this cannot resolve are the ones that do not
 * happen. (The boss fight is the exception, and lives on the server for exactly
 * that reason.)
 *
 * The winner is decided by the row's own `updatedAt`, on both sides, so the
 * result does not depend on which phone reached the network first.
 */

import { db, loadSettings, saveSettings } from '../db/database';
import type {
  CycleEntry, DayKey, ExerciseEntry, MemberId, MoodEntry, WorkEvent, WorkoutPhoto,
} from '../domain/types';
import { ENTRY_KINDS, takeWithinBudget, utf8Bytes, withinPayloadLimit } from '../domain/media/budget';

export const KINDS = ENTRY_KINDS;
export type EntryKind = (typeof KINDS)[number];

/** Matches MAX_WRITE in functions/api/entries.ts. */
const PUSH_CHUNK = 200;

/**
 * How many bytes of entries one POST may carry.
 *
 * Count alone stopped being a bound when photographs joined the table: 200 rows
 * of mood is a few hundred kilobytes, 200 rows of proof is a hundred megabytes,
 * and the edge would refuse the request before any of this code saw it.
 */
const PUSH_BYTE_BUDGET = 1024 * 1024;

export interface WireEntry {
  id: string;
  kind: EntryKind;
  day: DayKey;
  payload: unknown;
  updatedAt: number;
}

export interface PulledEntry extends WireEntry {
  memberId: MemberId;
  mine: boolean;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  applied: number;
  /**
   * Rows this round gave up on: too large to offer, or named by the server as
   * unacceptable. The watermark moves past them deliberately — see `sync()`.
   */
  skipped: number;
  /** True when the server had more than one page left. */
  more: boolean;
}

/**
 * Does an incoming row replace what is held locally?
 *
 * Strictly newer, never equal: a re-delivered row with the same timestamp is
 * the same row, and rewriting it would only churn the watermark.
 */
export function wins(incoming: { updatedAt: number }, existing?: { updatedAt: number }): boolean {
  return !existing || incoming.updatedAt > existing.updatedAt;
}

/**
 * A calendar day travels as one row whose payload is that day's events, because
 * the server's unique index is (member, kind, day). Keeping the local shape as
 * one row per event and grouping only at this boundary means moving one
 * appointment never rewrites an array.
 */
export function groupWork(events: WorkEvent[]): Map<DayKey, WorkEvent[]> {
  const byDay = new Map<DayKey, WorkEvent[]>();
  for (const e of events) {
    const list = byDay.get(e.day);
    if (list) list.push(e);
    else byDay.set(e.day, [e]);
  }
  return byDay;
}

/** A work day's timestamp is its most recently touched event. */
export function workDayUpdatedAt(events: WorkEvent[]): number {
  return events.reduce((max, e) => Math.max(max, e.updatedAt), 0);
}

/**
 * A day's workout proof travels as one row, for the same reason a day's
 * calendar does: the server's unique index is (member, kind, day), so the front
 * and back photographs cannot be two rows of kind `photo` on the same day
 * without colliding. Grouping them here keeps the local table one row per
 * camera, which is what the retake path wants.
 */
export function groupPhotos(photos: WorkoutPhoto[]): Map<DayKey, WorkoutPhoto[]> {
  const byDay = new Map<DayKey, WorkoutPhoto[]>();
  for (const p of photos) {
    const list = byDay.get(p.day);
    if (list) list.push(p);
    else byDay.set(p.day, [p]);
  }
  return byDay;
}

/** A day's proof is as new as the most recently retaken shot in it. */
export function photoDayUpdatedAt(photos: WorkoutPhoto[]): number {
  return photos.reduce((max, p) => Math.max(max, p.updatedAt), 0);
}

/** Everything this member has changed since the watermark, ready for the wire. */
export async function collectPending(memberId: MemberId, since: number): Promise<WireEntry[]> {
  const [moods, exercises, cycles, work, photos] = await Promise.all([
    db.moods.where('memberId').equals(memberId).toArray(),
    db.exercises.where('memberId').equals(memberId).toArray(),
    db.cycles.where('memberId').equals(memberId).toArray(),
    db.work.where('memberId').equals(memberId).toArray(),
    db.workoutPhotos.where('memberId').equals(memberId).toArray(),
  ]);

  const out: WireEntry[] = [];
  const simple = (kind: EntryKind, rows: Array<MoodEntry | ExerciseEntry | CycleEntry>) => {
    for (const row of rows) {
      if (row.updatedAt <= since) continue;
      out.push({ id: row.id, kind, day: row.day, payload: row, updatedAt: row.updatedAt });
    }
  };
  simple('mood', moods);
  simple('exercise', exercises);
  simple('cycle', cycles);

  for (const [day, events] of groupWork(work)) {
    const updatedAt = workDayUpdatedAt(events);
    if (updatedAt <= since) continue;
    // Synthesised rather than borrowed from one of the events: the row stands
    // for the whole day, and the event whose id it borrowed could be deleted.
    out.push({ id: `${memberId}-work-${day}`, kind: 'work', day, payload: events, updatedAt });
  }

  for (const [day, shots] of groupPhotos(photos)) {
    const updatedAt = photoDayUpdatedAt(shots);
    if (updatedAt <= since) continue;
    out.push({ id: `${memberId}-photo-${day}`, kind: 'photo', day, payload: shots, updatedAt });
  }

  return out.sort((a, b) => a.updatedAt - b.updatedAt);
}

/** Write one pulled row into the local record, if it is newer than what is here. */
async function applyEntry(entry: PulledEntry): Promise<boolean> {
  const { memberId, day, updatedAt } = entry;

  if (entry.kind === 'photo') {
    const shots = Array.isArray(entry.payload) ? (entry.payload as WorkoutPhoto[]) : [];
    const existing = await db.workoutPhotos.where('[memberId+day]').equals([memberId, day]).toArray();
    if (existing.length && !wins(entry, { updatedAt: photoDayUpdatedAt(existing) })) return false;
    // The day travels whole, like the calendar does, so a proof deleted on the
    // other phone stays deleted rather than being resurrected on the next sync.
    await db.workoutPhotos.bulkDelete(existing.map((s) => s.id));
    await db.workoutPhotos.bulkPut(shots.map((s) => ({ ...s, memberId, day })));
    return true;
  }

  if (entry.kind === 'work') {
    const events = Array.isArray(entry.payload) ? (entry.payload as WorkEvent[]) : [];
    const existing = await db.work.where('[memberId+day]').equals([memberId, day]).toArray();
    if (existing.length && !wins(entry, { updatedAt: workDayUpdatedAt(existing) })) return false;
    // The day travels whole, so it lands whole: an event deleted on the other
    // phone is absent from the payload, and leaving the local copy behind would
    // resurrect it on every sync.
    await db.work.bulkDelete(existing.map((e) => e.id));
    await db.work.bulkPut(events.map((e) => ({ ...e, memberId, day })));
    return true;
  }

  const table = entry.kind === 'mood' ? db.moods : entry.kind === 'exercise' ? db.exercises : db.cycles;
  const existing = await table.where('[memberId+day]').equals([memberId, day]).first();
  if (!wins(entry, existing)) return false;
  const row = entry.payload as MoodEntry | ExerciseEntry | CycleEntry;
  // The server's copy of id/member/day is authoritative; the payload is only
  // trusted for the fields the local row does not key on.
  await table.put({ ...row, id: existing?.id ?? entry.id, memberId, day, updatedAt } as never);
  return true;
}

export async function applyPulled(entries: PulledEntry[]): Promise<number> {
  let applied = 0;
  for (const entry of entries) {
    if (await applyEntry(entry)) applied++;
  }
  return applied;
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

/**
 * How big one entry is on the wire, so a chunk can be bounded by the thing that
 * actually costs. The payload is what varies by four orders of magnitude; the
 * envelope around it is a fixed hundred bytes or so.
 */
export function wireBytes(entry: WireEntry): number {
  return utf8Bytes(JSON.stringify(entry));
}

/**
 * Split what is pending into requests the server can actually accept.
 *
 * Two bounds, because either one alone is wrong. Count matches `MAX_WRITE` in
 * the endpoint, which is what keeps one statement run bounded. Bytes matter
 * because 200 rows of mood is a few hundred kilobytes and 200 rows of workout
 * proof is a hundred megabytes — the request would be refused at the edge,
 * before any of this reached the endpoint's own limits.
 *
 * A single entry over the byte budget still gets its own chunk rather than
 * being dropped here: whether the server will take it is the server's answer to
 * give, and it is the one that comes back naming the row.
 */
export function chunkForPush(
  entries: readonly WireEntry[],
  maxCount: number = PUSH_CHUNK,
  maxBytes: number = PUSH_BYTE_BUDGET,
): WireEntry[][] {
  const measured = entries.map((entry) => ({ entry, bytes: wireBytes(entry) }));
  const chunks: WireEntry[][] = [];
  let rest = measured;
  while (rest.length) {
    const taken = takeWithinBudget(rest.slice(0, maxCount), maxBytes);
    chunks.push(taken.map((m) => m.entry));
    rest = rest.slice(taken.length);
  }
  return chunks;
}

/**
 * Entries this client already knows the server will refuse.
 *
 * Checked here rather than only at the endpoint so an oversize row costs
 * nothing: no request, no round trip, and — most of the point — no chance of it
 * sitting at the head of the queue forever. The ceilings are the ones in
 * `domain/media/budget.ts`, which the endpoint mirrors.
 */
export function partitionSendable(entries: readonly WireEntry[]): {
  sendable: WireEntry[];
  oversize: WireEntry[];
} {
  const sendable: WireEntry[] = [];
  const oversize: WireEntry[] = [];
  for (const entry of entries) {
    if (withinPayloadLimit(entry.kind, JSON.stringify(entry.payload ?? null))) sendable.push(entry);
    else oversize.push(entry);
  }
  return { sendable, oversize };
}

/**
 * Is this status the server saying "never", rather than "not now"?
 *
 * The distinction is the whole of the fix. A 5xx or a dropped connection means
 * try again, and the watermark must not move past rows that have not landed. A
 * 413 or a 400 means this request will never be accepted however many times it
 * is repeated, and treating that as retryable is what wedged the queue: the
 * client threw, the watermark stayed, and the same doomed row was offered first
 * on every subsequent sync — taking mood, cycle and the calendar down with it,
 * silently, because `useSync.ts` swallows the error.
 *
 * 401 is deliberately *not* here. An expired token is a reason to stop and
 * re-pair, not a reason to discard the rows that were waiting.
 */
export function isPermanentRefusal(status: number): boolean {
  return status === 400 || status === 413;
}

interface ChunkResult {
  written: number;
  /** Ids the server named as unacceptable, which this client must stop offering. */
  refused: string[];
}

async function pushChunk(token: string, entries: WireEntry[]): Promise<ChunkResult> {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ entries }),
  });

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      written?: number;
      rejected?: Array<{ id?: unknown }>;
    };
    const refused = (body.rejected ?? [])
      .map((r) => r.id)
      .filter((id): id is string => typeof id === 'string');
    return { written: body.written ?? entries.length, refused };
  }

  if (!isPermanentRefusal(res.status)) {
    // Transient. Throwing leaves the watermark where it is, which is what makes
    // the next foreground try these rows again.
    throw new Error(`sync push failed: ${res.status}`);
  }

  // Permanent, and the server did not name which row. One row means it is that
  // row; more than one means bisect until it does.
  if (entries.length === 1) return { written: 0, refused: [entries[0].id] };

  const half = Math.ceil(entries.length / 2);
  const left = await pushChunk(token, entries.slice(0, half));
  const right = await pushChunk(token, entries.slice(half));
  return {
    written: left.written + right.written,
    refused: [...left.refused, ...right.refused],
  };
}

async function pull(token: string, since: number): Promise<{
  entries: PulledEntry[];
  cursor: number;
  more: boolean;
}> {
  const res = await fetch(`/api/entries?since=${encodeURIComponent(String(since))}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`sync pull failed: ${res.status}`);
  const body = (await res.json()) as {
    entries?: PulledEntry[];
    cursor?: number;
    more?: boolean;
  };
  return { entries: body.entries ?? [], cursor: body.cursor ?? since, more: !!body.more };
}

/**
 * One round trip. Returns null when the device is not paired yet, which is not
 * an error — it is the state every device starts in.
 */
export async function sync(): Promise<SyncResult | null> {
  const settings = await loadSettings();
  const token = settings.workerSecret;
  const memberId = settings.memberId;
  if (!token || !memberId) return null;

  const pushedAt = settings.syncPushedAt ?? 0;
  const pending = await collectPending(memberId, pushedAt);

  // Anything already known to be too large never leaves the phone.
  const { sendable, oversize } = partitionSendable(pending);

  let refused = oversize.length;
  for (const chunk of chunkForPush(sendable)) {
    const result = await pushChunk(token, chunk);
    refused += result.refused.length;
  }

  const { entries, cursor, more } = await pull(token, settings.syncPulledAt ?? 0);
  const applied = await applyPulled(entries);

  // Rows that arrived from the server are, by definition, already on it. Moving
  // the push watermark past them is what stops the next round sending them
  // straight back.
  //
  // Refused rows are included on purpose. They are the ones the server will
  // never take, so leaving the watermark behind them would offer them again on
  // every sync, forever, and everything edited after them would queue up behind
  // a row that cannot move. Stepping past a proof nobody can store is a smaller
  // loss than the day log stopping.
  const highWater = Math.max(
    pushedAt,
    ...pending.map((e) => e.updatedAt),
    ...entries.map((e) => e.updatedAt),
  );

  await saveSettings({ syncPushedAt: highWater, syncPulledAt: cursor });
  return {
    pushed: pending.length - refused,
    pulled: entries.length,
    applied,
    skipped: refused,
    more,
  };
}
