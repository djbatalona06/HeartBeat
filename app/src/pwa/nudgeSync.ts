import { db, loadSettings } from '../db/database';
import { putNudges } from './api';
import { todayKey } from '../domain/day';
import {
  DEFAULT_HOUR, lastTogetherDay, loggedDaysFrom, planNudges,
} from '../domain/notify/schedule';

/**
 * Refilling the reminder queue, on the occasions sync already runs.
 *
 * ## The outage this fixes
 *
 * `domain/notify/schedule.ts` plans `HORIZON_HOURS` — three days — ahead, and
 * every post replaces the whole queue. That is the right shape, and its own
 * comment gives the reason: "a phone that opens once a week must not fall
 * silent, and a phone that opens daily must not accumulate a backlog."
 *
 * Nothing refilled it. The only caller was `NotificationsBlock`, and only from
 * a tap on the switch, the hour or a kind. So three days after the last visit
 * to Settings the queue ran dry and reminders stopped — permanently, because
 * nothing on the ordinary path to the app ever planned again. Turning
 * reminders on and then simply using the app for a week was enough to lose
 * them, which is the one failure the horizon was chosen to prevent.
 *
 * ## Why it rides `useSync` rather than a timer of its own
 *
 * The occasions are already right: launch, foreground, and the network coming
 * back are exactly when a phone learns anything, and `useSync` already listens
 * for all three. A second set of listeners would be a second answer to the
 * same question, and an interval would wake a phone in a pocket to re-post a
 * plan that had not changed.
 *
 * The post is safe to repeat because `functions/api/nudges.ts` replaces rather
 * than appends, and the keys `planNudges` mints are stable for a given member,
 * day and kind — so posting the same plan twice writes the same rows twice and
 * leaves one queue. Delivered rows are untouched either way, which is what
 * stops a re-plan resending something already sent.
 *
 * Nothing here asks for permission. `enablePush` may only be called from a tap
 * — iOS surfaces the prompt no other way inside an installed app, and a denial
 * cannot be undone without deleting the icon — so this refills the queue for a
 * phone that already said yes and does nothing at all for one that has not.
 */
export async function replanNudges(): Promise<number | null> {
  const settings = await loadSettings();

  // Off, or never turned on. Not an error: most of these calls do nothing, and
  // that is the normal case rather than a failure worth reporting.
  if (settings.notifyOn !== true) return null;

  const token = settings.workerSecret;
  const memberId = settings.memberId;
  // Unpaired. There is no queue to own yet and no server to own it.
  if (!token || !memberId) return null;

  const [moods, exercises, cycles, work] = await Promise.all([
    db.moods.toArray(),
    db.exercises.toArray(),
    db.cycles.toArray(),
    db.work.toArray(),
  ]);

  const { timeZone } = settings;
  const logged = loggedDaysFrom(moods, exercises, cycles, work);

  return putNudges(token, planNudges({
    memberId,
    timeZone,
    // The hour is read here rather than passed in, for the reason the kinds
    // already were: every caller would otherwise have to remember it, and the
    // one that forgot would quietly move somebody's reminder.
    hour: settings.notifyHour ?? DEFAULT_HOUR,
    today: todayKey(timeZone),
    now: Date.now(),
    loggedDays: logged,
    lastTogether: lastTogetherDay(logged),
    kinds: settings.notifyKinds,
  }));
}
