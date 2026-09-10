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
