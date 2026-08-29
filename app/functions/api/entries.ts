import { authenticate, json, type Env } from './_lib';

/**
 * The couple's day log: mood, exercise, cycle and calendar.
 *
 * Mirrors the Worker's /entries so the app can sync same-origin, the way it
 * already does for chat and pairing. Both write the same table through the same
 * token scheme, so which surface serves a given device stays an implementation
 * detail.
 *
 * The payload is opaque JSON on purpose. Every kind the client tracks is one
 * row per member per kind per day, so the shape of what is inside belongs to
 * the domain types and not to a column list that would need a migration each
 * time a field is added.
 */

/** One page. A phone that has been off for a month should not pull a year. */
const MAX_ROWS = 500;

/** A batch big enough to drain a backlog, small enough to bound one statement run. */
const MAX_WRITE = 200;

/** Guards against a runaway payload filling D1 rather than against any real day. */
const MAX_PAYLOAD_BYTES = 64 * 1024;

const KINDS = ['mood', 'exercise', 'cycle', 'work'] as const;
type Kind = (typeof KINDS)[number];

interface Incoming {
  id?: unknown;
  kind?: unknown;
  day?: unknown;
  payload?: unknown;
  updatedAt?: unknown;
}

interface Row {
  id: string;
  member_id: string;
  kind: string;
  day: string;
  payload: string;
  updated_at: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const raw = Number(new URL(request.url).searchParams.get('since') ?? 0);
  const since = Number.isFinite(raw) && raw > 0 ? raw : 0;

  // Both members, because the point of the couple is that each can see the
  // other's day. Scoped to the couple, which is the only scope there is.
  const rows = await env.DB.prepare(
    `SELECT id, member_id, kind, day, payload, updated_at
       FROM entries WHERE couple_id = ? AND updated_at > ?
      ORDER BY updated_at ASC LIMIT ?`,
  )
    .bind(caller.coupleId, since, MAX_ROWS)
    .all<Row>();

  const entries = (rows.results ?? []).map((r) => ({
    id: r.id,
    memberId: r.member_id,
    kind: r.kind,
    day: r.day,
    payload: JSON.parse(r.payload) as unknown,
    updatedAt: r.updated_at,
    mine: r.member_id === caller.memberId,
  }));

  return json({
    entries,
    // The client's next cursor. Taken from the rows rather than from the clock,
    // so a device whose clock is off does not skip the rows it just missed.
    cursor: entries.length ? entries[entries.length - 1].updatedAt : since,
    more: entries.length === MAX_ROWS,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const body = (await request.json().catch(() => ({}))) as { entries?: unknown };
  const incoming = Array.isArray(body.entries) ? (body.entries as Incoming[]) : [];
  if (!incoming.length) return json({ ok: true, written: 0 });
  if (incoming.length > MAX_WRITE) return json({ error: 'too many entries' }, 413);

  const rows: Array<{ id: string; kind: Kind; day: string; payload: string; updatedAt: number }> = [];
  for (const e of incoming) {
    const kind = e.kind as Kind;
    if (!KINDS.includes(kind)) return json({ error: `unknown kind: ${String(e.kind)}` }, 400);
    if (typeof e.day !== 'string' || !DAY.test(e.day)) return json({ error: 'bad day' }, 400);
    if (typeof e.id !== 'string' || !e.id) return json({ error: 'id required' }, 400);
    const updatedAt = Number(e.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) return json({ error: 'bad updatedAt' }, 400);
    const payload = JSON.stringify(e.payload ?? null);
    if (payload.length > MAX_PAYLOAD_BYTES) return json({ error: 'payload too large' }, 413);
    rows.push({ id: e.id, kind, day: e.day, payload, updatedAt });
  }

  // Last write wins, decided by the row's own updatedAt rather than by arrival
  // order: two phones syncing after a flight would otherwise let the slower
  // connection overwrite the newer edit.
  await env.DB.batch(
    rows.map((r) =>
      env.DB.prepare(
        `INSERT INTO entries (id, couple_id, member_id, kind, day, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(member_id, kind, day) DO UPDATE SET
           payload = excluded.payload, updated_at = excluded.updated_at
         WHERE excluded.updated_at > entries.updated_at`,
      ).bind(r.id, caller.coupleId, caller.memberId, r.kind, r.day, r.payload, r.updatedAt),
    ),
  );

  return json({ ok: true, written: rows.length });
};
