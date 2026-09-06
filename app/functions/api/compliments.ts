import { authenticate, json, type Env } from './_lib';

/**
 * Sending one, and reading what has arrived.
 *
 * Delivery reuses the push pipe that already exists rather than building a
 * second one: a row in `scheduled_nudges`, drained by the Worker's every-minute
 * cron through `sendPush`. So this inherits VAPID, the retry, the dead-endpoint
 * cleanup and the deep link, and adds none of it.
 *
 * The row in `compliments` is what makes the notification worth opening. A push
 * that leads to nothing is worse than no push, so the message is stored and the
 * Mood page shows it — after the banner is dismissed, on the other phone, days
 * later.
 *
 * Nothing generated is ever sent unread. The body here is whatever the sender
 * chose or typed; /api/compliment only ever returns candidates.
 */

const MAX_BODY = 160;
const MIN_BODY = 2;
/** A week. Further out than that and someone has mistyped a date. */
const MAX_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const parsed = (await request.json().catch(() => ({}))) as {
    body?: unknown;
    deliverAt?: unknown;
    generated?: unknown;
    day?: unknown;
  };

  const text = typeof parsed.body === 'string' ? parsed.body.trim() : '';
  if (text.length < MIN_BODY) return json({ error: 'there is nothing to send' }, 400);
  if (text.length > MAX_BODY) return json({ error: 'that is too long for a notification' }, 400);

  const now = Date.now();
  const requested = typeof parsed.deliverAt === 'number' ? parsed.deliverAt : now;
  // A time already past means "now", which is what a sender who picked one
  // minute ago meant. Too far ahead is a typo, and refusing beats delivering it
  // in three years.
  if (requested > now + MAX_AHEAD_MS) return json({ error: 'that is too far ahead' }, 400);
  const deliverAt = Math.max(requested, now);

  const partner = await env.DB.prepare(
    'SELECT id FROM members WHERE couple_id = ? AND id != ? AND revoked_at IS NULL',
  )
    .bind(caller.coupleId, caller.memberId)
    .first<{ id: string }>();
  if (!partner) return json({ error: 'there is nobody to send this to yet' }, 409);

  const id = crypto.randomUUID();
  const day =
    typeof parsed.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.day)
      ? parsed.day
      : new Date(now).toISOString().slice(0, 10);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO compliments (id, couple_id, from_id, to_id, body, generated, deliver_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, caller.coupleId, caller.memberId, partner.id, text, parsed.generated ? 1 : 0, deliverAt, now),
    // Keyed by the compliment's own id so a resend cannot stack two
    // notifications for one message. The path is the deep link the service
    // worker opens — a notification should land on the thing it is about.
    env.DB.prepare(
      `INSERT INTO scheduled_nudges (key, couple_id, member_id, fire_at, title, body, path)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         fire_at = excluded.fire_at, title = excluded.title,
         body = excluded.body, delivered_at = NULL`,
    ).bind(`compliment-${id}`, caller.coupleId, partner.id, deliverAt, 'From your favourite person', text, '/#/mood'),
    env.DB.prepare(
      `INSERT INTO compliment_usage (member_id, day, sent) VALUES (?, ?, 1)
       ON CONFLICT(member_id, day) DO UPDATE SET sent = sent + 1`,
    ).bind(caller.memberId, day),
  ]);

  return json({ ok: true, id, deliverAt });
};

/**
 * What has arrived, and what was sent.
 *
 * Both directions on purpose: a screen showing only what you received makes the
 * feature feel one-sided when it is the same two people either way.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT id, from_id, to_id, body, deliver_at, created_at, read_at
       FROM compliments
      WHERE couple_id = ? AND deliver_at <= ?
      ORDER BY deliver_at DESC LIMIT 30`,
  )
    .bind(caller.coupleId, now)
    .all<{
      id: string;
      from_id: string;
      to_id: string;
      body: string;
      deliver_at: number;
      created_at: number;
      read_at: number | null;
    }>();

  return json({
    // A scheduled one is invisible until it lands, including to its sender —
    // otherwise the surprise is only a surprise for one of them.
    compliments: (results ?? []).map((row) => ({
      id: row.id,
      body: row.body,
      mine: row.from_id === caller.memberId,
      deliverAt: row.deliver_at,
      readAt: row.read_at,
    })),
  });
};

/** Mark one read, so the Mood page can stop drawing attention to it. */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const parsed = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof parsed.id !== 'string') return json({ error: 'id required' }, 400);

  // Only the recipient marks it read. A sender opening their own page should
  // not clear the badge on the other phone.
  await env.DB.prepare(
    'UPDATE compliments SET read_at = ? WHERE id = ? AND to_id = ? AND read_at IS NULL',
  )
    .bind(Date.now(), parsed.id, caller.memberId)
    .run();

  return json({ ok: true });
};
