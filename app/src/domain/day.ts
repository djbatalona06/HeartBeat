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
