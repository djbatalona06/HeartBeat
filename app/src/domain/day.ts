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
