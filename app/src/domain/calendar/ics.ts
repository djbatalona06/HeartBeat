import { addDays } from '../day';
import type { ExportableEvent } from './csv';
import type { DayKey } from '../types';

/**
 * The calendar as an .ics file, for Apple Calendar, Google Calendar and
 * anything else that opens one.
 *
 * Sits beside `csv.ts` and reads the same events, so the two exports cannot
 * disagree about what is on the calendar. Pure — no `Blob`, no DOM — so the
 * parts that go wrong in the wild (escaping, folding, an all-day range's
 * exclusive end) are testable in node.
 *
 * Three choices worth stating:
 *
 * **Times are floating, not zoned.** A CSV row is wall-clock time and the
 * import reads it that way; this writes it the same way. A zoned DTSTART would
 * need a VTIMEZONE block to be strictly valid, and would move an appointment if
 * the phone opening the file were somewhere else. Two people who share a
 * calendar mean "9am" wherever they are standing.
 *
 * **UIDs are stable.** `<id>@heartbeat` — the event's own id — so importing the
 * same file twice updates the events it created instead of doubling them.
 *
 * **All-day means a date, not a time.** `VALUE=DATE`, with DTEND the day
 * *after*, because iCalendar's end date is exclusive.
 */

const CRLF = '\r\n';
/** RFC 5545 §3.1: lines are folded at 75 octets, not characters. */
const FOLD_OCTETS = 75;

/** Backslash, semicolon, comma and newline are the four that change meaning. */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a line at 75 octets, continuing with CRLF and one space. Splits between
 * code points, never inside one, so a name with an emoji in it stays a name.
 */
export function icsFold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= FOLD_OCTETS) return line;
  const out: string[] = [];
  let current = '';
  let used = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // A continuation line starts with the space, which costs one octet.
    const limit = out.length === 0 ? FOLD_OCTETS : FOLD_OCTETS - 1;
    if (used + size > limit) {
      out.push(current);
      current = '';
      used = 0;
    }
    current += ch;
    used += size;
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

const compactDay = (day: DayKey) => day.replace(/-/g, '');

function compactClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const h = String(Math.floor(clamped / 60)).padStart(2, '0');
  const m = String(clamped % 60).padStart(2, '0');
  return `${h}${m}00`;
}

/** `20260927T041500Z` — the moment the file was made, in UTC. */
function stamp(at: Date): string {
  return `${at.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

export type IcsEvent = ExportableEvent & { id: string };

export function toCalendarIcs(events: readonly IcsEvent[], at: Date = new Date()): string {
  const dtstamp = stamp(at);
  const sorted = [...events].sort((a, b) => (
    a.day.localeCompare(b.day)
    || (a.startsAt ?? -1) - (b.startsAt ?? -1)
    || a.title.localeCompare(b.title)
  ));

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HeartBeat//Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const e of sorted) {
    lines.push('BEGIN:VEVENT', `UID:${icsText(e.id)}@heartbeat`, `DTSTAMP:${dtstamp}`);
    if (e.startsAt === undefined) {
      lines.push(
        `DTSTART;VALUE=DATE:${compactDay(e.day)}`,
        `DTEND;VALUE=DATE:${compactDay(addDays(e.day, 1))}`,
      );
    } else {
      lines.push(`DTSTART:${compactDay(e.day)}T${compactClock(e.startsAt)}`);
      if (e.endsAt !== undefined && e.endsAt > e.startsAt) {
        lines.push(`DTEND:${compactDay(e.day)}T${compactClock(e.endsAt)}`);
      }
    }
    lines.push(`SUMMARY:${icsText(e.title)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(icsFold).join(CRLF)}${CRLF}`;
}
