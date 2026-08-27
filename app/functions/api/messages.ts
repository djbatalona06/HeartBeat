import { authenticate, json, type Env } from './_lib';

/**
 * The couple's message thread.
 *
 * A message is an event: it happens once, at a time, and is never revised. So
 * unlike entries — one row per member per kind per day, upserted — these are
 * insert-only, and the pull is a simple "everything since T" against the
 * (couple_id, created_at) index.
 */

/** One page of history. A phone catching up after a week should not pull a year. */
const MAX_ROWS = 200;

/** Long enough to say something real, short enough that a paste cannot flood D1. */
const MAX_BODY = 2000;

interface Row {
  id: string;
  member_id: string;
  body: string;
  created_at: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const since = Number(new URL(request.url).searchParams.get('since') ?? 0);
  const rows = await env.DB.prepare(
    `SELECT id, member_id, body, created_at FROM messages
      WHERE couple_id = ? AND created_at > ?
      ORDER BY created_at ASC LIMIT ?`,
  )
    .bind(caller.coupleId, Number.isFinite(since) ? since : 0, MAX_ROWS)
    .all<Row>();

  return json({
    messages: (rows.results ?? []).map((r) => ({
      id: r.id,
      memberId: r.member_id,
      body: r.body,
      createdAt: r.created_at,
      // Whose side of the thread this belongs on, resolved server-side so the
      // client never has to compare ids it might not have loaded yet.
      mine: r.member_id === caller.memberId,
    })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const parsed = (await request.json().catch(() => ({}))) as { body?: unknown };
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
  if (!body) return json({ error: 'body required' }, 400);
  if (body.length > MAX_BODY) return json({ error: 'message too long' }, 413);

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  await env.DB.prepare(
    'INSERT INTO messages (id, couple_id, member_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, caller.coupleId, caller.memberId, body, createdAt)
    .run();

  return json({ id, memberId: caller.memberId, body, createdAt, mine: true });
};
