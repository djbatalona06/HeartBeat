import { authenticate, json, type Env } from './_lib';

/**
 * The RPG layer, synced to the couple.
 *
 * `entries` carries everything keyed by a *day*. This carries everything keyed
 * by a *row*: gear inventory, hatched companions, the coin-and-XP sheet, tasks
 * and the weekly quest. Before it, all of those lived only on the phone that
 * made them — so a reinstall, or a recovery onto a new phone, brought back the
 * couple's whole history and none of their possessions.
 *
 * Shaped after `entries.ts` on purpose, down to the upsert: same bearer, same
 * couple scoping, same last-write-wins by the row's own `updatedAt` rather than
 * by arrival order, same "reject the row, not the batch" response so one bad
 * row cannot wedge a queue. Two endpoints that do the same job should not have
 * two different sets of edge cases.
 */

const KINDS = ['inventory', 'pet', 'avatar', 'quest', 'task'] as const;
type Kind = (typeof KINDS)[number];

/**
 * Only `quest` is couple-shared: one quest belongs to the two of you, either
 * can start or retire it, and both devices must converge on the same one.
 *
 * Everything else has exactly one writer — your own inventory, your own
 * companions, your own sheet, your own list — which is what makes
 * last-write-wins provably safe rather than merely usually right: with a
 * single writer there is no second version to lose.
 */
const SHARED: readonly Kind[] = ['quest'];

/**
 * Per-row ceiling. These rows are small by construction — an inventory row is
 * a couple of hundred bytes, the largest is a task with notes — so this is not
 * a budget anybody spends, it is a guard against a client bug turning one row
 * into a megabyte and taking the couple's sync down with it.
 */
const MAX_PAYLOAD_BYTES = 8 * 1024;

/** How many rows one push may carry. Matches the client's chunker. */
const MAX_WRITE = 200;

/** How many rows one pull may serve, so a large restore arrives in pages. */
const PAGE = 300;

/**
 * The upsert, exported so it can be run against real SQLite.
 *
 * Its two guard clauses are the whole of this endpoint's correctness and
 * neither is visible from the outside — a refused write and a write that
 * happened to be a no-op look identical to the caller. `worker/src/holdings.
 * test.ts` applies the real migrations and runs this exact string, which is
 * the same arrangement `pairing.ts` uses for the join race, and for the same
 * reason: a hand-written fake would return whatever the test wanted and prove
 * nothing about what the database does.
 */
export const UPSERT_SQL =
  `INSERT INTO holdings (id, kind, couple_id, member_id, payload, updated_at)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(kind, id) DO UPDATE SET
     payload    = excluded.payload,
     updated_at = excluded.updated_at,
     -- The writer of record moves with the write, which only ever matters for
     -- a shared kind; for the rest it is already the same member every time.
     member_id  = excluded.member_id
   WHERE excluded.updated_at > holdings.updated_at
     -- A member may overwrite their own row, or any row of a kind that belongs
     -- to the couple rather than to one of them. Not each other's inventories:
     -- two people who can rewrite each other's possessions is not a sync, it
     -- is a bug waiting for a bad clock.
     AND (holdings.member_id = excluded.member_id OR excluded.kind IN ('quest'))`;

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const since = Number(new URL(request.url).searchParams.get('since') ?? 0);
  const from = Number.isFinite(since) && since > 0 ? since : 0;

  // One extra row is asked for and never served: it is how "is there more"
  // is answered without a second COUNT over the same range.
  const { results } = await env.DB.prepare(
    `SELECT id, kind, member_id, payload, updated_at
       FROM holdings
      WHERE couple_id = ? AND updated_at > ?
      ORDER BY updated_at ASC, kind ASC, id ASC
      LIMIT ?`,
  )
    .bind(caller.coupleId, from, PAGE + 1)
    .all<{ id: string; kind: string; member_id: string; payload: string; updated_at: number }>();

  const page = (results ?? []).slice(0, PAGE);
  const more = (results ?? []).length > PAGE;

  const rows = page.map((r) => ({
    id: r.id,
    kind: r.kind,
    memberId: r.member_id,
    // Parsed here rather than on the client so a row that was somehow stored
    // as invalid JSON is one null payload instead of an exception in the
    // middle of applying a page.
    payload: JSON.parse(r.payload) as unknown,
    updatedAt: r.updated_at,
    /** Resolved server-side, so the client applies without loading its own id. */
    mine: r.member_id === caller.memberId,
  }));

  return json({
    rows,
    // The server's own cursor, echoed back from the rows it served — never a
    // local clock. A phone running a minute fast would otherwise ask for
    // changes since a future moment and skip everything in between. Same rule
    // as /api/entries.
    cursor: page.length ? page[page.length - 1].updated_at : from,
    more,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const body = (await request.json().catch(() => ({}))) as {
    rows?: Array<{ id?: unknown; kind?: unknown; payload?: unknown; updatedAt?: unknown }>;
  };
  const incoming = Array.isArray(body.rows) ? body.rows : [];
  if (incoming.length > MAX_WRITE) return json({ error: 'too many rows' }, 413);

  const rejected: Array<{ id: string; reason: string }> = [];
  const rows: Array<{ id: string; kind: Kind; payload: string; updatedAt: number }> = [];

  for (const r of incoming) {
    // Without an id the client cannot be told to stop offering the row, which
    // is the one failure that wedges a queue rather than skipping a row.
    if (typeof r.id !== 'string' || !r.id) return json({ error: 'id required' }, 400);
    const kind = r.kind as Kind;
    if (!KINDS.includes(kind)) {
      rejected.push({ id: r.id, reason: `unknown kind: ${String(r.kind)}` });
      continue;
    }
    const updatedAt = Number(r.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
      rejected.push({ id: r.id, reason: 'bad updatedAt' });
      continue;
    }
    const payload = JSON.stringify(r.payload ?? null);
    const size = utf8Bytes(payload);
    if (size > MAX_PAYLOAD_BYTES) {
      rejected.push({ id: r.id, reason: `payload too large: ${size} > ${MAX_PAYLOAD_BYTES}` });
      continue;
    }
    rows.push({ id: r.id, kind, payload, updatedAt });
  }

  if (rows.length) {
    await env.DB.batch(
      rows.map((r) =>
        env.DB.prepare(UPSERT_SQL).bind(
          r.id, r.kind, caller.coupleId, caller.memberId, r.payload, r.updatedAt,
        ),
      ),
    );
  }

  return json({ ok: true, written: rows.length, rejected, shared: SHARED });
};
