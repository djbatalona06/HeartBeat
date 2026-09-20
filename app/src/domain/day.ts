import type { DayKey } from './types';

/**
 * Formats an instant as a calendar day in a named zone. Intl does the work so
 * there is no DST arithmetic to get wrong; `en-CA` yields YYYY-MM-DD directly.
 */
export function dayKey(at: Date, timeZone: string): DayKey {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function todayKey(timeZone: string): DayKey {
  return dayKey(new Date(), timeZone);
}

/** Days are compared and shifted as plain calendar dates, never as instants. */
export function addDays(day: DayKey, delta: number): DayKey {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  at.setUTCDate(at.getUTCDate() + delta);
  return at.toISOString().slice(0, 10);
}

export function daysBetween(from: DayKey, to: DayKey): number {
  const parse = (s: DayKey) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86400000);
}

/**
 * ISO-8601 week number of a day key: Monday-start weeks, the first week of the
 * year being whichever one holds that year's first Thursday. Used to rotate
 * the same two starter tasks into both phones without either one syncing a
 * choice — the week number is arithmetic, so it agrees with itself.
 */
export function isoWeekOf(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Nearest Thursday: ISO weeks are defined by which week holds it.
  const dayNum = (date.getUTCDay() + 6) % 7; // Monday = 0 .. Sunday = 6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/**
 * Monday = 0 … Sunday = 6.
 *
 * The same convention `isoWeekOf` above already counts in, and deliberately so:
 * this app now has one definition of a week, and the weekly wager and the week
 * strip on Move both hang off it. Two definitions would mean a thread showing
 * seven days that the wager measuring "this week" disagreed with, which is the
 * kind of thing nobody notices until a Sunday.
 *
 * It is *not* the convention the two month grids use — `WorkPage` and
 * `CyclePage` head their columns with Sunday. That is a different question: a
 * month grid is a calendar page and follows the locale's idea of a page, while
 * a week here is a window with a start and an end that something is counted
 * inside.
 */
export function weekdayIndex(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The Monday of the week holding `day`. `day` itself, when it is a Monday. */
export function startOfWeek(day: DayKey): DayKey {
  return addDays(day, -weekdayIndex(day));
}

/**
 * The seven days of the week holding `day`, Monday first.
 *
 * Whole calendar days rather than a rolling window back from today, for the
 * reason `domain/notify/schedule.ts` gives about reminders: a week is a thing
 * with a Monday, not the last hundred and sixty-eight hours. A rolling window
 * would also mean the strip re-ordered itself every midnight, so the bubble a
 * person had learned to reach for moved under their thumb.
 */
export function weekOf(day: DayKey): DayKey[] {
  const monday = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/* ---- month grids ---------------------------------------------------------- */

/**
 * The four calculations a month grid needs, in one place.
 *
 * `WorkPage` and `CyclePage` each held a byte-for-byte copy of all four, and
 * `domain/schedule/presets.ts` has a third variant of the same arithmetic in
 * `monthGrid`. Three copies of a date calculation is three chances for one of
 * them to be fixed and the others not — and these are the calculations where
 * that goes wrong quietly, because a grid whose lead padding is off by one
 * still renders a perfectly plausible month.
 *
 * `sundayIndex` is the odd one against `weekdayIndex` above, and both are
 * right: a month grid heads its columns with Sunday because that is what a
 * calendar page looks like where this app is used, while a week that something
 * is *counted inside* starts on Monday. Naming them for the day they count
 * from is what stops the wrong one being reached for.
 */

/** The `YYYY-MM` a day belongs to. */
export function monthOf(day: DayKey): string {
  return day.slice(0, 7);
}

/** Sunday = 0 … Saturday = 6, for a month grid's lead padding. */
export function sundayIndex(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Every day in a `YYYY-MM`, in order. */
export function daysInMonth(month: string): DayKey[] {
  const [y, m] = month.split('-').map(Number);
  // Day 0 of the next month is the last day of this one, which is how this
  // avoids a leap-year table.
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: count }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}

/** `YYYY-MM` shifted by whole months, across year boundaries. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + delta;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/**
 * One item from a pool, chosen by the day rather than at random.
 *
 * Arithmetic, and that is the whole point: both phones land on the same
 * suggestion with nothing synced between them, and reopening a screen does not
 * reshuffle the thing you were about to go and do. The reflection prompt and
 * the kindness suggestion each carried their own copy of these four lines
 * before a third caller made the duplication worth naming — the arithmetic is
 * unchanged, so every existing pick still resolves to what it always did.
 *
 * Only the digits, so the dashes in a day key do not skew the hash, and a
 * modulo at each step so a far-future date cannot overflow into a float.
 */
export function pickForDay<T>(day: DayKey, pool: readonly T[]): T | undefined {
  if (!pool.length) return undefined;
  const digits = day.replace(/\D/g, '');
  let hash = 0;
  for (const ch of digits) hash = (hash * 10 + Number(ch)) % 100000;
  return pool[hash % pool.length];
}
