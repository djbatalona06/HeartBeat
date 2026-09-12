import { authenticate, json, type Env } from './_lib';

/**
 * Telling the other phone that today might be a hard one, without telling it why.
 *
 * Delivery reuses the pipe that already exists — a row in `scheduled_nudges`,
 * drained by the Worker's every-minute cron — exactly as `compliments.ts` does,
 * and for the same reason: VAPID, the retry, the dead-endpoint cleanup and the
 * deep link are all already written.
 *
 * It is **not** posted through /api/nudges, and that is not a style choice.
 * That endpoint replaces the caller's whole queue in one batch, so a second
 * producer using it would silently delete the daily reminders every time
 * somebody logged a day one.
 *
 * Two things here are about the people rather than the plumbing.
 *
 * **Consent belongs to whoever logs the cycle.** There is no flag on this
 * request asking whether the partner wants these; the tracker's own device
 * decides whether to call this at all (`Settings.shareCycleNudge`). It is their
 * data, so it is their call, and a partner cannot subscribe themselves to it.
 *
 * **The partner's copy never names it.** A notification arrives on a lock
 * screen, in a café, in front of whoever is standing there — which is the exact
 * exposure `features/cycle/lock.ts` exists to prevent, and there is no point
 * PIN-locking the page if the push says it out loud. So the partner is told
 * that today might be rough and what would help, and nothing else. The
 * tracker's own copy may be plain: it is going to the person it is about.
 */

/** Matches the ceiling /api/nudges enforces, so both producers agree. */
const MAX_TEXT = 200;

const TRACKER = {
  title: 'Day one',
  body: 'Logged. The list can wait — today is allowed to be a smaller one.',
  path: '/#/mood',
};

const PARTNER = {
  title: 'A thought',
  body: 'Today might be a rough one for them. Something small would land well.',
  path: '/#/activities/support',
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const parsed = (await request.json().catch(() => ({}))) as { day?: unknown };
  const day = typeof parsed.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.day)
    ? parsed.day
    : null;
  if (!day) return json({ error: 'a day is required' }, 400);

  // Belt and braces on copy this file owns: if either line is ever edited past
  // the ceiling, fail here rather than write a row the drain cannot deliver.
  for (const note of [TRACKER, PARTNER]) {
    if (note.body.length > MAX_TEXT || note.title.length > MAX_TEXT) {
      return json({ error: 'notification text too long' }, 500);
    }
  }

  const partner = await env.DB.prepare(
    'SELECT id FROM members WHERE couple_id = ? AND id != ? AND revoked_at IS NULL',
  )
    .bind(caller.coupleId, caller.memberId)
    .first<{ id: string }>();

  const now = Date.now();

  /**
   * Keyed by couple, day and recipient, so re-logging the same day updates one
   * row rather than stacking a second notification. `delivered_at = NULL` on
   * conflict is what lets a corrected time re-fire; it cannot duplicate,
   * because the key is the same.
   */
  const row = (memberId: string, note: typeof TRACKER) =>
    env.DB.prepare(
      `INSERT INTO scheduled_nudges (key, couple_id, member_id, fire_at, title, body, path)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         fire_at = excluded.fire_at, title = excluded.title,
         body = excluded.body, delivered_at = NULL`,
    ).bind(
      `cycle:${caller.coupleId}:${day}:${memberId}`,
      caller.coupleId,
      memberId,
      now,
      note.title,
      note.body,
      note.path,
    );

  const writes = [row(caller.memberId, TRACKER)];
  // Nobody paired yet is an ordinary state, not an error: the tracker still
  // gets their own, and there is simply no second phone to tell.
  if (partner) writes.push(row(partner.id, PARTNER));

  await env.DB.batch(writes);
  return json({ ok: true, told: partner ? 2 : 1 });
};
