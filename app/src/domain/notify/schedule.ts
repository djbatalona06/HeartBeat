/**
 * When to nudge, and what to say.
 *
 * Pure. The phone computes the next few days of reminders and posts the whole
 * list; the Worker stores them and delivers them on its cron. Nothing here
 * touches the network, a table, or the clock except through the arguments.
 *
 * The posture matters as much as the mechanics. There is exactly one reminder a
 * day at most, it is skipped on a day already logged, and the one nudge about
 * having been away says so once rather than every day. An app that reminds you
 * about the thing you are avoiding, daily, is the thing `docs/DESIGN.md` says
 * not to build.
 */

import { addDays } from '../day';
import type { DayKey } from '../types';

/**
 * How far ahead to plan.
 *
 * Three days, because a phone that opens once a week must not fall silent, and
 * a phone that opens daily must not accumulate a backlog of stale reminders.
 * Every post replaces the lot, so the only cost of a longer horizon is more
 * rows to throw away.
 */
export const HORIZON_HOURS = 72;

/**
 * How long a couple can be away before the app says anything about it.
 *
 * Two days is a weekend. Anything shorter and the app is nagging about a normal
 * gap; anything longer and the reminder arrives after they have already noticed
 * themselves.
 */
export const QUIET_DAYS = 2;

/** The default hour, local, if Settings has never been asked. */
export const DEFAULT_HOUR = 20;

export interface Nudge {
  /**
   * Stable for a given member, day and kind, which is what makes a full replace
   * idempotent: posting the same plan twice writes the same primary keys.
   */
  key: string;
  fireAt: number;
  title: string;
  body: string;
  path: string;
}

export interface NudgePlan {
  memberId: string;
  timeZone: string;
  /** Local hour, 0–23, the daily reminder is aimed at. */
  hour: number;
  /** The day the plan is made on, in the member's zone. */
  today: DayKey;
  now: number;
  /** Days that already have something logged; a reminder for them is skipped. */
  loggedDays: readonly DayKey[];
  /** The last day either of them did anything, if there is one. */
  lastTogether?: DayKey;
}

/**
 * The offset of a zone at an instant, in milliseconds.
 *
 * Read from `Intl` rather than a table, so it is right for every zone and every
 * historical rule change without this file knowing any of them.
 */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Some engines render midnight as hour 24 under hour12:false.
  const hour = get('hour') % 24;

  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - instant;
}

/**
 * The instant at which a given wall-clock hour happens on a given local day.
 *
 * Two passes, and the second one is the whole reason this is a function rather
 * than arithmetic. The first pass guesses using the offset that applies to the
 * *guess*, which on a day the clocks change is the offset from the wrong side
 * of the change — 20:00 on a spring-forward Sunday would land an hour out. The
 * second pass re-reads the offset at the corrected instant and, if the zone
 * disagrees with itself, uses the corrected one.
 *
 * On a nonexistent local time — 02:30 in a zone that skips 02:00 to 03:00 —
 * the two passes cannot agree, and this returns the instant the clock jumps to.
 * That is the right answer for a reminder: the nearest moment that exists.
 */
export function instantAt(day: DayKey, hour: number, timeZone: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, hour);

  const first = offsetAt(wall, timeZone);
  const once = wall - first;

  const second = offsetAt(once, timeZone);
  return second === first ? once : wall - second;
}

/** The most recent day anything was logged, or undefined if nothing ever was. */
export function lastTogetherDay(days: readonly DayKey[]): DayKey | undefined {
  let latest: DayKey | undefined;
  for (const day of days) if (!latest || day > latest) latest = day;
  return latest;
}

/** Whole days between two day keys, by string arithmetic on the calendar. */
function dayGap(from: DayKey, to: DayKey): number {
  const at = (s: DayKey) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/**
 * The days the horizon covers, starting today.
 *
 * Whole days rather than a rolling window, because a reminder is a wall-clock
 * event: "eight in the evening" is a thing that happens on a day, not 72 hours
 * from a moment.
 */
export function horizonDays(today: DayKey, hours: number = HORIZON_HOURS): DayKey[] {
  const span = Math.max(1, Math.ceil(hours / 24));
  return Array.from({ length: span }, (_, i) => addDays(today, i));
}

/**
 * The next few days of reminders.
 *
 * Everything about this is subtractive: it starts with one reminder per day and
 * removes the ones that would be unkind or pointless — a day already logged, a
 * time already past, a second nudge about the same absence.
 */
export function planNudges(input: NudgePlan): Nudge[] {
  const logged = new Set(input.loggedDays);
  const out: Nudge[] = [];

  for (const day of horizonDays(input.today)) {
    // Nothing to remind them of on a day they have already dealt with.
    if (logged.has(day)) continue;

    const fireAt = instantAt(day, input.hour, input.timeZone);
    // A reminder whose moment has passed is not a reminder; it is a push
    // notification arriving the instant the cron next runs.
    if (fireAt <= input.now) continue;

    out.push({
      key: `${input.memberId}:daily:${day}`,
      fireAt,
      title: 'How was today?',
      body: 'A minute on the app, whenever suits.',
      path: '/#/mood',
    });
  }

  // One line about having been away, and only one, on the first day of the
  // horizon. Repeating it daily would make the app something to feel bad about.
  const away = input.lastTogether ? dayGap(input.lastTogether, input.today) : null;
  if (away !== null && away > QUIET_DAYS) {
    const first = out[0];
    if (first) {
      out[0] = {
        ...first,
        key: `${input.memberId}:away:${input.today}`,
        title: 'Still here',
        body: 'Nothing is lost while you are away. Come back when you like.',
        path: '/#/',
      };
    }
  }

  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/**
 * The days that count as "already dealt with", from whatever rows carry a day.
 *
 * Any of the logs will do: a person who logged a workout does not need to be
 * reminded to open the app, whatever they did or did not put on the mood tab.
 * Reminding them anyway is how a helpful app turns into a nagging one.
 */
export function loggedDaysFrom(...groups: ReadonlyArray<ReadonlyArray<{ day: DayKey }>>): DayKey[] {
  const days = new Set<DayKey>();
  for (const group of groups) for (const row of group) days.add(row.day);
  return [...days].sort();
}

