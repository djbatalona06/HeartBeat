import { addDays } from '../day';
import type { DayKey, MinuteOfDay } from '../types';
import {
  normalizeDay, parseDateTime, stableEventIdForKey,
  type CsvPreview, type ExportableEvent, type ImportedEvent,
} from './csv';

/**
 * The calendar as an .ics file, for Apple Calendar, Google Calendar and
 * anything else that opens one.
 *
 * Export and import sit beside the CSV parser because the shared calendar needs
 * the same safety guarantees whichever file a phone hands it: dates remain
 * dates, source UIDs remain stable across an update, and a questionable event
 * is reported instead of guessed into somebody's week.
 *
 * Three export choices worth stating:
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
/** An all-day import longer than this is almost certainly not a shared event. */
const MAX_SPAN_DAYS = 60;

/** Backslash, semicolon, comma and newline are the four that change meaning. */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** The inverse for property values read from an .ics file. */
export function icsValue(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_match, escaped: string) => {
    if (escaped === 'n' || escaped === 'N') return '\n';
    return escaped;
  });
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

/* ---- importing ------------------------------------------------------------- */

interface IcsLine {
  line: number;
  text: string;
}

interface IcsProperty {
  name: string;
  parameters: Record<string, string>;
  value: string;
}

interface IcsRawEvent {
  line: number;
  properties: Map<string, IcsProperty>;
}

/** Undo RFC 5545 line folding before the parser looks for property delimiters. */
export function unfoldIcs(text: string): IcsLine[] {
  const physical = text.replace(/\r\n|\r/g, '\n').split('\n');
  const out: IcsLine[] = [];
  physical.forEach((textLine, index) => {
    if (/^[ \t]/.test(textLine) && out.length > 0) {
      out[out.length - 1].text += textLine.slice(1);
      return;
    }
    if (textLine !== '') out.push({ line: index + 1, text: textLine });
  });
  return out;
}

function propertyOf(line: string): IcsProperty | undefined {
  const colon = line.indexOf(':');
  if (colon <= 0) return undefined;
  const head = line.slice(0, colon).split(';');
  const name = head.shift()?.trim().toUpperCase();
  if (!name) return undefined;
  const parameters: Record<string, string> = {};
  for (const part of head) {
    const equals = part.indexOf('=');
    if (equals <= 0) continue;
    parameters[part.slice(0, equals).trim().toUpperCase()] = part.slice(equals + 1).trim().replace(/^"|"$/g, '');
  }
  return { name, parameters, value: line.slice(colon + 1) };
}

function parseIcsDate(value: string, timeZone: string): { day: DayKey; minutes?: MinuteOfDay; allDay: boolean } | undefined {
  const raw = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (date) {
    const day = normalizeDay(`${date[1]}-${date[2]}-${date[3]}`);
    return day ? { day, allDay: true } : undefined;
  }

  const timed = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(raw);
  if (!timed) return undefined;
  const hours = Number(timed[4]);
  const minutes = Number(timed[5]);
  const seconds = timed[6] === undefined ? 0 : Number(timed[6]);
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;

  const text = `${timed[1]}-${timed[2]}-${timed[3]}T${timed[4]}:${timed[5]}:${timed[6] ?? '00'}${timed[7] ? 'Z' : ''}`;
  const parsed = parseDateTime(text, timeZone);
  return parsed ? { ...parsed, allDay: false } : undefined;
}

function previewProblem(line: number, reason: string, text: string) {
  return { line, reason, text: text.slice(0, 120) };
}

/**
 * Parse an iCalendar export into the same preview shape the CSV import uses.
 *
 * A provider UID is the source key. It makes a later export update an event in
 * place even after the provider changes its title or moves it to another day.
 * All-day DTEND is exclusive per RFC 5545, so its final visible day is one day
 * earlier than the property says.
 */
export function parseCalendarIcs(
  text: string,
  options: { memberId: string; timeZone: string },
): CsvPreview {
  const lines = unfoldIcs(text);
  const problems: CsvPreview['problems'] = [];
  if (!lines.some((line) => line.text.trim().toUpperCase() === 'BEGIN:VCALENDAR')) {
    return {
      events: [],
      problems: [previewProblem(1, 'could not find a VCALENDAR — is this an .ics calendar export?', '')],
      duplicates: 0,
    };
  }

  const records: IcsRawEvent[] = [];
  let active: IcsRawEvent | null = null;
  for (const entry of lines) {
    const marker = entry.text.trim().toUpperCase();
    if (marker === 'BEGIN:VEVENT') {
      active = { line: entry.line, properties: new Map() };
      continue;
    }
    if (marker === 'END:VEVENT') {
      if (active) records.push(active);
      active = null;
      continue;
    }
    if (!active) continue;
    const property = propertyOf(entry.text);
    if (property && !active.properties.has(property.name)) active.properties.set(property.name, property);
  }

  if (active) problems.push(previewProblem(active.line, 'event ended before END:VEVENT', 'BEGIN:VEVENT'));
  if (records.length === 0) {
    return {
      events: [],
      problems: [previewProblem(1, 'no events were found in this calendar file', '')],
      duplicates: 0,
    };
  }

  const found = new Map<string, ImportedEvent>();
  let duplicates = 0;
  const keep = (event: ImportedEvent) => {
    if (found.has(event.id)) duplicates += 1;
    found.set(event.id, event);
  };

  for (const record of records) {
    const summary = icsValue(record.properties.get('SUMMARY')?.value ?? '').replace(/\s+/g, ' ').trim();
    const starts = record.properties.get('DTSTART');
    const ends = record.properties.get('DTEND');
    if (!summary) {
      problems.push(previewProblem(record.line, 'no event name', 'BEGIN:VEVENT'));
      continue;
    }
    if (!starts) {
      problems.push(previewProblem(record.line, 'no DTSTART value', summary));
      continue;
    }

    const start = parseIcsDate(starts.value, options.timeZone);
    if (!start) {
      problems.push(previewProblem(record.line, `could not read DTSTART "${starts.value.slice(0, 40)}"`, summary));
      continue;
    }
    const end = ends ? parseIcsDate(ends.value, options.timeZone) : undefined;
    const isAllDay = starts.parameters.VALUE?.toUpperCase() === 'DATE' || start.allDay;
    const uid = icsValue(record.properties.get('UID')?.value ?? '').trim();
    const baseKey = uid || `${start.day}|${summary}|${start.minutes ?? 'all-day'}`;

    if (!isAllDay) {
      keep({
        id: stableEventIdForKey(options.memberId, baseKey, 'ics'),
        day: start.day,
        title: summary,
        startsAt: start.minutes,
        endsAt: end && end.day === start.day && end.minutes !== undefined && end.minutes > (start.minutes ?? -1)
          ? end.minutes
          : undefined,
      });
      continue;
    }

    // DATE-form DTEND is exclusive. A missing or backwards end is one day.
    const finalDay = end && end.day > start.day ? addDays(end.day, -1) : start.day;
    let day = start.day;
    for (let count = 0; day <= finalDay; count += 1) {
      if (count >= MAX_SPAN_DAYS) {
        problems.push(previewProblem(record.line, `spans more than ${MAX_SPAN_DAYS} days — kept the first ${MAX_SPAN_DAYS}`, summary));
        break;
      }
      keep({
        id: stableEventIdForKey(options.memberId, `${baseKey}|${day}`, 'ics'),
        day,
        title: summary,
      });
      day = addDays(day, 1);
    }
  }

  const events = [...found.values()].sort((a, b) => (
    a.day.localeCompare(b.day)
    || (a.startsAt ?? -1) - (b.startsAt ?? -1)
    || a.title.localeCompare(b.title)
  ));
  return { events, problems, duplicates };
}
