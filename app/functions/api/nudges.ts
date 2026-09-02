import { authenticate, json, type Env } from './_lib';

/**
 * The reminders a phone has asked to be delivered later.
 *
 * A **full replace**, not an append. The phone computes the next few days from
 * what it knows and posts the lot; everything undelivered for that member is
 * dropped in the same batch and replaced by what arrived.
 *
 * That is the whole design, and it is what makes a phone that has been off for
 * a week recompute rather than replay. An append-only endpoint would leave a
 * backlog of reminders for days that have since been logged, and the person
 * would come back to a stack of notifications telling them to do things they
 * have already done. A replace cannot accumulate.
 *
 * Delivered rows are left alone: they are the Worker's record of what it has
 * already sent, and deleting them would let the same reminder be sent twice.
 */

/** Enough for a horizon several times longer than the client actually plans. */
const MAX_NUDGES = 64;

/** Long enough for a sentence, short enough not to be a place to put data. */
const MAX_TEXT = 200;

/** A day and a bit past the client's horizon, so a clock that is out still lands. */
const MAX_AHEAD_MS = 96 * 60 * 60 * 1000;

interface Incoming {
  key?: unknown;
  fireAt?: unknown;
  title?: unknown;
  body?: unknown;
  path?: unknown;
}

interface Row {
  key: string;
  fireAt: number;
  title: string;
  body: string;
  path: string;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

/**
 * Where tapping the notification goes.
 *
 * An in-app hash route and nothing else. The service worker passes this to
 * `clients.openWindow`, so a value from anywhere but here would be an
 * open-redirect with a notification as the bait.
 */
function inAppPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!/^\/#\/[A-Za-z0-9/_-]*$/.test(value) || value.length > 120) return null;
  return value;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const body = (await request.json().catch(() => ({}))) as { nudges?: unknown };
  const incoming = Array.isArray(body.nudges) ? (body.nudges as Incoming[]) : [];
  if (incoming.length > MAX_NUDGES) return json({ error: 'too many nudges' }, 413);

  const now = Date.now();
  const rows: Row[] = [];
  const seen = new Set<string>();

  for (const n of incoming) {
    const key = text(n.key, 200);
    const title = text(n.title, MAX_TEXT);
    const nudgeBody = text(n.body, MAX_TEXT);
    const path = inAppPath(n.path);
    const fireAt = Number(n.fireAt);

    if (!key || !title || !nudgeBody || !path) return json({ error: 'bad nudge' }, 400);
    if (!Number.isFinite(fireAt)) return json({ error: 'bad fireAt' }, 400);
    // A reminder in the past would fire on the very next cron tick, which is a
    // notification arriving for no reason; one far in the future is a clock
    // that is wrong, and would sit in the table until it was noticed.
    if (fireAt <= now || fireAt > now + MAX_AHEAD_MS) continue;
    // The key is the primary key, so a batch containing it twice would fail
    // the whole statement run rather than the one row.
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({ key, fireAt, title, body: nudgeBody, path });
  }

  // One batch: the delete and the inserts land together, so there is no instant
  // at which this member has no reminders because the new ones have not arrived.
  const statements = [
    env.DB.prepare(
      'DELETE FROM scheduled_nudges WHERE member_id = ? AND delivered_at IS NULL',
    ).bind(caller.memberId),
    ...rows.map((r) =>
      env.DB.prepare(
        `INSERT INTO scheduled_nudges (key, couple_id, member_id, fire_at, title, body, path, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(key) DO UPDATE SET
           fire_at = excluded.fire_at, title = excluded.title,
           body = excluded.body, path = excluded.path`,
      ).bind(r.key, caller.coupleId, caller.memberId, r.fireAt, r.title, r.body, r.path),
    ),
  ];

  await env.DB.batch(statements);
  return json({ ok: true, scheduled: rows.length });
};

/** What is queued, so the Settings screen can say so rather than guess. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT key, fire_at, title FROM scheduled_nudges
      WHERE member_id = ? AND delivered_at IS NULL
      ORDER BY fire_at ASC LIMIT ?`,
  )
    .bind(caller.memberId, MAX_NUDGES)
    .all<{ key: string; fire_at: number; title: string }>();

  return json({
    nudges: (rows.results ?? []).map((r) => ({ key: r.key, fireAt: r.fire_at, title: r.title })),
  });
};

/** Turning reminders off: drop everything not yet sent, keep the record of what was. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  await env.DB.prepare('DELETE FROM scheduled_nudges WHERE member_id = ? AND delivered_at IS NULL')
    .bind(caller.memberId)
    .run();

  return json({ ok: true });
};
