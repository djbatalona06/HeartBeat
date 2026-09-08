import { addDays, dayKey } from '../day';

/**
 * The arithmetic behind the deadline picker.
 *
 * The component draws a month and a column of times; everything that decides
 * *which* month, *which* times and what "tomorrow morning" means lives here,
 * where it can be tested. The same split `features/exercise/photo.ts` already
 * makes, and for the same reason — a calendar is mostly sums, and sums about
 * dates are where the quiet bugs are.
 *
 * Everything works in the member's own timezone, which is this app's rule
 * everywhere. A picker that offered "tonight" against a UTC clock would offer
 * yesterday evening to anyone west of London.
 */

export interface Preset {
  id: string;
  label: string;
  /** The instant it resolves to, or null when it has already gone by today. */
  at: number | null;
}

/** Where the hours land. Chosen to read as times of day, not as slots. */
export const PRESET_HOURS = { morning: 9, afternoon: 14, evening: 20 } as const;

/**
 * An instant for a wall-clock time on a given day in a given zone.
 *
 * Built by measuring the zone's offset at roughly the right moment rather than
 * by string arithmetic: the offset itself changes across a DST boundary, so
 * "8pm on the 29th" is not a fixed number of hours from midnight UTC.
 */
export function instantAtHour(day: string, hour: number, timeZone: string): number {
  const [y, m, d] = day.split('-').map(Number);
  // A first guess in UTC, then corrected by the offset actually in force there.
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0, 0);
  const offset = zoneOffsetMs(guess, timeZone);
  const corrected = guess - offset;
  // One more pass, because the correction can itself cross the boundary.
  return guess - zoneOffsetMs(corrected, timeZone);
}

/** How far ahead of UTC the zone is at that instant, in milliseconds. */
function zoneOffsetMs(at: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(at));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    // `hour` can come back as 24 for midnight under hour12: false.
    const asUtc = Date.UTC(
      get('year'), get('month') - 1, get('day'),
      get('hour') % 24, get('minute'), get('second'),
    );
    return asUtc - at;
  } catch {
    return 0;
  }
}

/**
 * The quick choices above the calendar.
 *
 * A preset whose moment has passed comes back with `at: null` rather than being
 * dropped, so the row keeps its shape and the component can grey it out. A row
 * that changes length through the day is harder to use than one that does not.
 */
export function presetsFor(now: number, timeZone: string): Preset[] {
  const today = dayKey(new Date(now), timeZone);
  const tomorrow = addDays(today, 1);

  const upcoming = (at: number) => (at > now ? at : null);

  return [
    { id: 'tonight', label: 'Tonight', at: upcoming(instantAtHour(today, PRESET_HOURS.evening, timeZone)) },
    { id: 'tomorrow-morning', label: 'Tomorrow morning', at: instantAtHour(tomorrow, PRESET_HOURS.morning, timeZone) },
    { id: 'tomorrow-evening', label: 'Tomorrow evening', at: instantAtHour(tomorrow, PRESET_HOURS.evening, timeZone) },
    { id: 'weekend', label: 'This weekend', at: instantAtHour(nextSaturday(today), PRESET_HOURS.morning, timeZone) },
  ];
}

/** The next Saturday strictly after this day, so "this weekend" is never today. */
export function nextSaturday(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, ((6 - weekday + 7) % 7) || 7);
}

/** The days of the month that holds `day`, padded to whole weeks from Monday. */
export function monthGrid(day: string): (string | null)[] {
  const [y, m] = day.split('-').map(Number);
  const first = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const [fy, fm, fd] = first.split('-').map(Number);
  // Monday-first, which is what the rest of the app's week already assumes.
  const lead = (new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const cells: (string | null)[] = Array(lead).fill(null);
  for (let i = 0; i < length; i += 1) cells.push(addDays(first, i));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Move a day key by whole months, clamping onto a shorter month's last day. */
export function shiftMonth(day: string, by: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + by, 1));
  const length = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(d, length);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

/**
 * The times offered for a chosen day.
 *
 * Half-hourly, and everything already past is dropped when the day is today —
 * a scrollable column of times you cannot pick is a column of dead rows.
 */
export function slotsFor(day: string, now: number, timeZone: string, stepMinutes = 30): number[] {
  const out: number[] = [];
  const base = instantAtHour(day, 0, timeZone);
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const at = base + minutes * 60_000;
    if (at > now) out.push(at);
  }
  return out;
}
