import { addDays, dayKey } from '../day';
import type { DayKey, MinuteOfDay, WorkEvent } from '../types';

/**
 * The calendar as a file.
 *
 * The Work screen is a shared calendar filled from a file you export from your
 * own, so this module is the whole seam between a real calendar's CSV and a
 * `WorkEvent`. Everything here is pure: no `File`, no `Blob`, no DOM, so the
 * parsing that actually goes wrong in the wild is testable in node.
 *
 * Three rules shape it.
 *
 * **Be tolerant, but refuse loudly.** Google and Outlook both export something
 * like `Subject, Start Date, Start Time, End Date, End Time, All Day Event`,
 * but the column order moves, the date format follows the exporting machine's
 * locale, and times come 12- or 24-hour. Anything we can read, we read. A row
 * we cannot read is reported by line number rather than guessed at: an
 * appointment filed on the wrong day is worse than one that never arrived.
 *
 * **Days are calendar dates in a named zone, never instants.** A CSV's
 * `08/27/2026, 9:00 AM` is already wall-clock time in the exporting calendar's
 * zone, so it is read as digits and never routed through a local `Date`. Only
 * the ISO-with-offset form (`2026-08-27T14:30:00Z`) names an instant, and that
 * one is converted through the couple's `settings.timeZone`.
 *
 * **The same file imported twice changes nothing.** Every row gets an id
 * derived from its own content — see `stableEventId` — so a re-import lands on
 * the rows it landed on last time instead of doubling them.
 */

export interface ImportedEvent {
  /** Derived from the row's content, so a re-import overwrites rather than adds. */
  id: string;
  day: DayKey;
  title: string;
  startsAt?: MinuteOfDay;
  endsAt?: MinuteOfDay;
}

/** A row we would not import, kept with enough context to point at it. */
export interface CsvProblem {
  /** 1-based line in the file where the row started. */
  line: number;
  reason: string;
  /** The row itself, trimmed for display. */
  text: string;
}

export interface CsvPreview {
  events: ImportedEvent[];
  problems: CsvProblem[];
  /** Rows that repeated one already read — collapsed rather than imported twice. */
  duplicates: number;
}

export interface CsvRecord {
  /** 1-based line the record started on; a quoted field can span several. */
  line: number;
  cells: string[];
}

/** The columns we write, and the ones a Google or Outlook export gives us. */
export const CSV_HEADER = [
  'Subject',
  'Start Date',
  'Start Time',
  'End Date',
  'End Time',
  'All Day Event',
] as const;

/** An all-day range longer than this is almost certainly not a shared event. */
const MAX_SPAN_DAYS = 60;

/* ---- reading the file ----------------------------------------------------- */

/**
 * RFC 4180 with the corners real exports actually hit: quoted fields holding
 * commas and newlines, doubled quotes, CRLF or LF or bare CR, a leading BOM,
 * and blank lines between records.
 *
 * Deliberately forgiving at the end of the file: a quote left open is closed
 * rather than thrown, because the last row of a truncated download is still
 * worth reading.
 */
export function splitCsv(text: string): CsvRecord[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let started = false;

  const endRecord = () => {
    cells.push(field);
    field = '';
    // A blank line is separator noise, not a record — and so is the row of
    // bare commas a spreadsheet pads the end of a file with, which is the same
    // nothing written a column at a time.
    if (cells.some((c) => c.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
    started = false;
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (!started) {
      recordLine = line;
      started = true;
    }

    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else if (ch === '\r' && source[i + 1] === '\n') {
        // Normalise a CRLF inside a quoted note down to a single newline.
        continue;
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      line += 1;
      endRecord();
    } else {
      field += ch;
    }
  }
  if (started) endRecord();

  return records;
}

type Field = 'title' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'allDay' | 'start' | 'end';

/**
 * Header spellings we answer to. Matching is on letters and digits only, so
 * "Start Date", "start_date" and "StartDate" are all the same column.
 */
const HEADER_ALIASES: Record<string, Field> = {
  subject: 'title',
  title: 'title',
  summary: 'title',
  event: 'title',
  eventname: 'title',
  name: 'title',
  what: 'title',

  startdate: 'startDate',
  begindate: 'startDate',
  date: 'startDate',
  day: 'startDate',

  starttime: 'startTime',
  begintime: 'startTime',
  time: 'startTime',

  enddate: 'endDate',
  finishdate: 'endDate',

  endtime: 'endTime',
  finishtime: 'endTime',

  alldayevent: 'allDay',
  allday: 'allDay',
  isalldayevent: 'allDay',

  start: 'start',
  starts: 'start',
  startdatetime: 'start',

  end: 'end',
  ends: 'end',
  enddatetime: 'end',
};

export function readHeader(cells: readonly string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  cells.forEach((cell, i) => {
    const field = HEADER_ALIASES[cell.toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (field && map[field] === undefined) map[field] = i;
  });
  return map;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const pad = (n: number | string, width = 2) => String(n).padStart(width, '0');

function makeDay(y: number, m: number, d: number): DayKey | undefined {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return undefined;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const at = new Date(Date.UTC(y, m - 1, d));
  // Rejects the 30th of February rather than rolling it quietly into March.
  if (at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return undefined;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

function monthFromName(word: string): number | undefined {
  const w = word.toLowerCase();
  if (w.length < 3) return undefined;
  const i = MONTHS.findIndex((name) => name === w || name.slice(0, 3) === w.slice(0, 3));
  return i < 0 ? undefined : i + 1;
}

/**
 * A date cell into a DayKey, or undefined when we cannot tell what it says.
 *
 * `03/04/2026` is read the way Google and Outlook write it — month first —
 * except when the first number cannot be a month, which is the one case where
 * a day-first export says so unambiguously.
 */
export function normalizeDay(value: string): DayKey | undefined {
  const raw = value.trim();
  if (!raw) return undefined;

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
  if (iso) return makeDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slashed = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(raw);
  if (slashed) {
    const a = Number(slashed[1]);
    const b = Number(slashed[2]);
    const year = slashed[3].length === 2 ? 2000 + Number(slashed[3]) : Number(slashed[3]);
    return a > 12 && b <= 12 ? makeDay(year, b, a) : makeDay(year, a, b);
  }

  // "12 August 2026" and "August 12, 2026".
  const dayFirst = /^(\d{1,2})\s+([a-z]+),?\s+(\d{4})$/i.exec(raw);
  if (dayFirst) {
    const m = monthFromName(dayFirst[2]);
    return m === undefined ? undefined : makeDay(Number(dayFirst[3]), m, Number(dayFirst[1]));
  }
  const monthFirst = /^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(raw);
  if (monthFirst) {
    const m = monthFromName(monthFirst[1]);
    return m === undefined ? undefined : makeDay(Number(monthFirst[3]), m, Number(monthFirst[2]));
  }

  return undefined;
}

/**
 * A time cell into minutes past midnight, or undefined when there is no time
 * in it — which is how an all-day row announces itself.
 */
export function normalizeMinutes(value: string): MinuteOfDay | undefined {
  const t = value.trim().toLowerCase().replace(/[.\s]/g, '');
  if (!t) return undefined;
  if (t === 'noon' || t === 'midday') return 12 * 60;
  if (t === 'midnight') return 0;

  // Outlook occasionally writes a bare "1430".
  if (/^\d{4}$/.test(t)) {
    const h = Number(t.slice(0, 2));
    const m = Number(t.slice(2));
    return h <= 23 && m <= 59 ? h * 60 + m : undefined;
  }

  const m = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?(am|pm)?$/.exec(t);
  if (!m) return undefined;
  let hours = Number(m[1]);
  const minutes = m[2] === undefined ? 0 : Number(m[2]);
  const seconds = m[3] === undefined ? 0 : Number(m[3]);
  if (minutes > 59 || seconds > 59) return undefined;

  if (m[4]) {
    if (hours < 1 || hours > 12) return undefined;
    if (hours === 12) hours = 0;
    if (m[4] === 'pm') hours += 12;
  } else if (hours > 23) {
    return undefined;
  }
  return hours * 60 + minutes;
}

/** The wall clock in a named zone, so an instant never lands on the wrong day. */
function zoned(at: Date, timeZone: string): { day: DayKey; minutes: MinuteOfDay } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { day: dayKey(at, timeZone), minutes: (read('hour') % 24) * 60 + read('minute') };
}

/**
 * One cell holding both halves — `2026-08-27T14:30:00`, `08/27/2026 2:30 PM`.
 *
 * Only the form that names an offset is an instant; everything else is read as
 * wall-clock time exactly as written.
 */
export function parseDateTime(
  value: string,
  timeZone: string,
): { day: DayKey; minutes?: MinuteOfDay } | undefined {
  const raw = value.trim();
  if (!raw) return undefined;

  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) return undefined;
    return zoned(at, timeZone);
  }

  // A date on its own — including "27 August 2026", which has spaces in it.
  const whole = normalizeDay(raw);
  if (whole) return { day: whole, minutes: undefined };

  // Otherwise the cell is a date and a time with something between them. Try
  // the longest date first, so a month name is not mistaken for the whole of
  // it, and take the first split where both halves read.
  for (let i = raw.length - 1; i > 0; i -= 1) {
    if (raw[i] !== 'T' && !/\s/.test(raw[i])) continue;
    const day = normalizeDay(raw.slice(0, i));
    if (!day) continue;
    const minutes = normalizeMinutes(raw.slice(i + 1));
    if (minutes !== undefined) return { day, minutes };
  }
  return undefined;
}

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'x', 'on']);

/* ---- the stable id -------------------------------------------------------- */

/** FNV-1a. Two passes with different seeds, so the hex is wide enough to trust. */
function hash32(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The id a row will occupy, derived from the row itself.
 *
 * Keyed on the member, the day, the folded title and the start time — the four
 * things that make a calendar entry *that* entry. Re-importing an unchanged
 * file therefore rewrites the same rows instead of doubling them, and nudging
 * an event's end time in the source calendar updates the row in place rather
 * than leaving a twin behind. Moving it to another day or renaming it does
 * make a new row: at that point it is a different event, and the stale one is
 * removed the same way any event is.
 */
export function stableEventId(
  memberId: string,
  event: { day: DayKey; title: string; startsAt?: MinuteOfDay },
): string {
  const key = [
    memberId,
    event.day,
    event.title.trim().toLowerCase().replace(/\s+/g, ' '),
    event.startsAt ?? 'all-day',
  ].join(' ');
  const half = (seed: number) => pad(hash32(key, seed).toString(16), 8);
  return `csv-${half(0x811c9dc5)}${half(0x9e3779b1)}`;
}

/* ---- the import ----------------------------------------------------------- */

function byDayThenTime(a: ImportedEvent, b: ImportedEvent): number {
  return (
    a.day.localeCompare(b.day)
    || (a.startsAt ?? -1) - (b.startsAt ?? -1)
    || a.title.localeCompare(b.title)
  );
}

/**
 * A calendar export into events we could save, plus the rows we refused.
 *
 * Nothing is written here — the caller shows this and asks first.
 */
export function parseCalendarCsv(
  text: string,
  options: { memberId: string; timeZone: string },
): CsvPreview {
  const { memberId, timeZone } = options;
  const records = splitCsv(text);
  const problems: CsvProblem[] = [];

  if (records.length === 0) {
    return {
      events: [],
      problems: [{ line: 1, reason: 'the file is empty', text: '' }],
      duplicates: 0,
    };
  }

  const header = readHeader(records[0].cells);
  if (header.title === undefined || (header.startDate === undefined && header.start === undefined)) {
    return {
      events: [],
      problems: [{
        line: records[0].line,
        reason: 'no Subject and Start Date columns — is this a calendar export?',
        text: records[0].cells.join(', ').slice(0, 120),
      }],
      duplicates: 0,
    };
  }

  const found = new Map<string, ImportedEvent>();
  let duplicates = 0;

  const keep = (event: ImportedEvent) => {
    if (found.has(event.id)) duplicates += 1;
    found.set(event.id, event);
  };

  for (const record of records.slice(1)) {
    const cell = (field: Field): string => {
      const at = header[field];
      return at === undefined ? '' : (record.cells[at] ?? '').trim();
    };
    const refuse = (reason: string) => {
      problems.push({ line: record.line, reason, text: record.cells.join(', ').slice(0, 120) });
    };

    const title = cell('title').replace(/\s+/g, ' ').trim();
    if (!title) {
      refuse('no event name');
      continue;
    }

    const startCell = cell('start');
    const start = startCell
      ? parseDateTime(startCell, timeZone)
      : readParts(cell('startDate'), cell('startTime'));
    if (!start) {
      refuse(`could not read the start date "${(startCell || cell('startDate')).slice(0, 40)}"`);
      continue;
    }

    const endCell = cell('end');
    const end = endCell
      ? parseDateTime(endCell, timeZone)
      : readParts(cell('endDate'), cell('endTime'), start.day);

    // "All Day Event, True" says so outright; so does a row with no time on it.
    const allDay = TRUTHY.has(cell('allDay').toLowerCase()) || start.minutes === undefined;
    const startsAt = allDay ? undefined : start.minutes;

    // An end time only means something on the same day: a WorkEvent has one
    // day, and a run past midnight cannot be said in minutes past this one.
    const endsAt =
      startsAt !== undefined && end && end.day === start.day
      && end.minutes !== undefined && end.minutes > startsAt
        ? end.minutes
        : undefined;

    if (!allDay || !end || end.day <= start.day) {
      keep({
        id: stableEventId(memberId, { day: start.day, title, startsAt }),
        day: start.day,
        title,
        startsAt,
        endsAt,
      });
      continue;
    }

    // A multi-day all-day event — a holiday, a trip — becomes one entry per
    // day, so every day it covers reads as busy in the grid.
    let day = start.day;
    for (let i = 0; day <= end.day; i += 1) {
      if (i >= MAX_SPAN_DAYS) {
        refuse(`spans more than ${MAX_SPAN_DAYS} days — kept the first ${MAX_SPAN_DAYS}`);
        break;
      }
      keep({ id: stableEventId(memberId, { day, title }), day, title });
      day = addDays(day, 1);
    }
  }

  return { events: [...found.values()].sort(byDayThenTime), problems, duplicates };
}

/**
 * A date cell and a time cell together.
 *
 * `onDay` stands in for an *absent* date, never an unreadable one: an export
 * with an End Time and no End Date column at all — or with that cell left
 * empty, which Google does for a same-day event — plainly means the day the
 * event started on, while a date we cannot read is still a date we refuse to
 * guess at.
 */
function readParts(
  date: string,
  time: string,
  onDay?: DayKey,
): { day: DayKey; minutes?: MinuteOfDay } | undefined {
  const day = date.trim() ? normalizeDay(date) : onDay;
  return day ? { day, minutes: normalizeMinutes(time) } : undefined;
}

/* ---- the export ----------------------------------------------------------- */

export type ExportableEvent = Pick<WorkEvent, 'day' | 'title' | 'startsAt' | 'endsAt'>;

/** Quote only when the value would otherwise change meaning. */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim()
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

/** 2026-08-27 into 08/27/2026, the shape a calendar expects to be handed back. */
export function usDate(day: DayKey): string {
  return `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`;
}

/** 540 into "9:00 AM". Upper case, because that is what the exporters write. */
export function csvClock(minutes: MinuteOfDay): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(minutes % 60)} ${suffix}`;
}

/**
 * The calendar back out in the shape it came in, so a round trip through
 * another calendar keeps every day, title and time it started with. CRLF and a
 * trailing newline, because that is what RFC 4180 says and what a spreadsheet
 * opens without complaining.
 */
export function toCalendarCsv(events: readonly ExportableEvent[]): string {
  const rows = [...events]
    .sort((a, b) => (
      a.day.localeCompare(b.day)
      || (a.startsAt ?? -1) - (b.startsAt ?? -1)
      || a.title.localeCompare(b.title)
    ))
    .map((e) => [
      e.title,
      usDate(e.day),
      e.startsAt === undefined ? '' : csvClock(e.startsAt),
      usDate(e.day),
      e.startsAt === undefined || e.endsAt === undefined ? '' : csvClock(e.endsAt),
      e.startsAt === undefined ? 'True' : 'False',
    ]);
  return `${[[...CSV_HEADER], ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/* ---- how full a day looks ------------------------------------------------- */

/**
 * A day's event count into a grade the stylesheet paints with the active
 * theme's accent. Four steps, not ten: the grid is a glance, and past "quite a
 * lot" the exact number stops changing what you would do about it — and the
 * count itself is still on the cell for anyone who wants it.
 */
export function loadGrade(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}
