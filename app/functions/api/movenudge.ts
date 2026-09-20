import { authenticate, json, type Env } from './_lib';

/**
 * Telling the other phone that they moved today.
 *
 * Delivery reuses the pipe that already exists — a row in `scheduled_nudges`,
 * drained by the Worker's every-minute cron — exactly as `cyclenudge.ts` and
 * `compliments.ts` do. VAPID, the retry, the dead-endpoint cleanup and the deep
 * link are all already written.
 *
 * It is **not** posted through /api/nudges. That endpoint replaces the caller's
 * whole queue in one batch, so a second producer using it would silently delete
 * the daily reminders every time somebody saved a workout.
 *
 * ## The one line this does not copy from cyclenudge.ts
 *
 * That file resets `delivered_at = NULL` on conflict, so a corrected entry
 * re-fires. Here that would be a bug, and a loud one: the Move screen saves
 * whenever somebody taps "Save the day", which happens repeatedly as sets go in
 * one at a time. Resetting the row would buzz the other phone once per tap.
 *
 * So this is `DO NOTHING`. The key is the couple, the day and the recipient, so
 * the first workout logged on a day tells them and every later save that day is
 * a no-op. Being told once that your partner trained is news; being told six
 * times is the app being the reason you put the phone down.
 *
 * ## Only the partner is told
 *
 * `cyclenudge.ts` writes to both phones because the tracker's own copy says
 * something useful back to them ("today is allowed to be a smaller one"). There
 * is no equivalent here — you know you went to the gym, you were there — so the
 * person who logged it gets nothing, and a couple with no second phone yet
 * writes no rows at all.
 *
 * ## What it says
 *
 * News about them, never a measurement of you. No numbers, no comparison, no
 * streak: "they moved" and nothing else. `domain/notifications/derive.ts`
 * argues the same line about badges — every one of them is somebody offering
 * you something, never the app noting what you did not do — and a push is the
 * loudest surface in the app to break that rule on. A nudge that read "they
 * have trained three times this week and you have not" is the kind of thing
 * people uninstall an app over, and it would be trivially easy to write here.
 */

/** Matches the ceiling /api/nudges enforces, so every producer agrees. */
const MAX_TEXT = 200;

const PARTNER = {
  title: 'They moved today',
  body: 'Logged on their side. No pressure — just so you know.',
  path: '/#/exercise',
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
  if (PARTNER.body.length > MAX_TEXT || PARTNER.title.length > MAX_TEXT) {
    return json({ error: 'notification text too long' }, 500);
  }

  const partner = await env.DB.prepare(
    'SELECT id FROM members WHERE couple_id = ? AND id != ? AND revoked_at IS NULL',
  )
    .bind(caller.coupleId, caller.memberId)
    .first<{ id: string }>();

  // Nobody paired yet is an ordinary state, not an error. There is simply no
  // second phone to tell, and the workout still saved.
  if (!partner) return json({ ok: true, told: 0 });

  await env.DB.prepare(
    `INSERT INTO scheduled_nudges (key, couple_id, member_id, fire_at, title, body, path)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO NOTHING`,
  )
    .bind(
      `move:${caller.coupleId}:${day}:${partner.id}`,
      caller.coupleId,
      partner.id,
      Date.now(),
      PARTNER.title,
      PARTNER.body,
      PARTNER.path,
    )
    .run();

  return json({ ok: true, told: 1 });
};
