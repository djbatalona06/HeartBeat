import { describe, expect, it } from 'vitest';
import {
  csvCell,
  csvClock,
  loadGrade,
  normalizeDay,
  normalizeMinutes,
  parseCalendarCsv,
  parseDateTime,
  readHeader,
  splitCsv,
  stableEventId,
  toCalendarCsv,
  usDate,
} from './csv';

/**
 * The import is the one place in the app where a stranger's file decides what
 * lands on a shared calendar, so every way a real export differs from the
 * happy path is pinned here: quoted commas, newlines inside a field, four date
 * formats, 12- and 24-hour clocks, all-day rows with no time at all, and rows
 * that are simply wrong and have to be refused rather than guessed at.
 *
 * The two that would be invisible in a screenshot get the most attention. A
 * day is a calendar date in a named zone, so an ISO instant has to be pulled
 * through the couple's zone or the whole month slides by one. And the row id
 * is derived from the row, so importing the same file twice has to change
 * nothing.
 */

const MEMBER = 'm1';
const LA = 'America/Los_Angeles';
const OPTIONS = { memberId: MEMBER, timeZone: LA };

/** What Google hands you: quoted subject with a comma, a wrapped description,
 *  an all-day anniversary, a row with no subject, and a date nobody can read. */
const GOOGLE_EXPORT = [
  'Subject,Start Date,Start Time,End Date,End Time,All Day Event,Description,Location',
  '"Standup, then coffee",08/27/2026,9:00 AM,08/27/2026,9:30 AM,False,"Daily\nsync",Kitchen',
  'Anniversary,08/29/2026,,08/29/2026,,True,,',
  ',08/30/2026,10:00 AM,08/30/2026,11:00 AM,False,,',
  'Dentist,tomorrow,2:00 PM,,,False,,',
].join('\r\n');

/** Outlook: different order, 24-hour clock, TRUE/FALSE shouted. */
const OUTLOOK_EXPORT = [
  '"All day event","Subject","Start Time","Start Date","End Time","End Date"',
  'FALSE,Physio,14:30,2026-09-01,15:30,2026-09-01',
  'TRUE,"Trip to the coast",,2026-09-04,,2026-09-06',
].join('\n');

const ROUND_TRIP = [
  { day: '2026-08-27', title: 'Standup, then coffee', startsAt: 540, endsAt: 570 },
  { day: '2026-08-29', title: 'Anniversary' },
  { day: '2026-09-01', title: 'A "quoted" thing', startsAt: 0 },
];

describe('splitCsv', () => {
  it('keeps a comma that lives inside a quoted field', () => {
    expect(splitCsv('a,"b,c",d')[0].cells).toEqual(['a', 'b,c', 'd']);
  });

  it('keeps a newline inside a quoted field and still counts lines', () => {
    const records = splitCsv('one,"a\nb"\r\ntwo,x');
    expect(records[0].cells).toEqual(['one', 'a\nb']);
    expect(records[1]).toEqual({ line: 3, cells: ['two', 'x'] });
  });

  it('reads a doubled quote as one quote', () => {
    expect(splitCsv('"say ""hi""",b')[0].cells).toEqual(['say "hi"', 'b']);
  });

  it('handles CRLF, bare CR and LF alike', () => {
    expect(splitCsv('a\r\nb\rc\nd').map((r) => r.cells[0])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops a leading byte-order mark rather than gluing it to the header', () => {
    expect(splitCsv('﻿Subject,Start Date')[0].cells[0]).toBe('Subject');
  });

  it('skips blank lines without spending a record on them', () => {
    const records = splitCsv('a\n\n\nb\n');
    expect(records.map((r) => [r.line, r.cells[0]])).toEqual([[1, 'a'], [4, 'b']]);
  });

  it('keeps empty cells so column positions do not shift', () => {
    expect(splitCsv('a,,c')[0].cells).toEqual(['a', '', 'c']);
  });

  it('skips the row of bare commas a spreadsheet pads a file with', () => {
    const records = splitCsv('a,b\n,\n,\nc,d\n');
    expect(records.map((r) => [r.line, r.cells[0]])).toEqual([[1, 'a'], [4, 'c']]);
  });

  it('closes a quote left open at the end of a truncated file', () => {
    expect(splitCsv('a,"b')[0].cells).toEqual(['a', 'b']);
  });
});

describe('readHeader', () => {
  it('finds columns whatever order and spelling they arrive in', () => {
    expect(readHeader(['All Day Event', 'SUBJECT', 'start_date', 'Start Time'])).toEqual({
      allDay: 0, title: 1, startDate: 2, startTime: 3,
    });
  });

  it('ignores columns it has no use for', () => {
    expect(readHeader(['Subject', 'Description', 'Location'])).toEqual({ title: 0 });
  });
});

describe('normalizeDay', () => {
  it('reads the month-first form the big calendars export', () => {
    expect(normalizeDay('08/27/2026')).toBe('2026-08-27');
    expect(normalizeDay('8/7/2026')).toBe('2026-08-07');
    expect(normalizeDay('08-27-2026')).toBe('2026-08-27');
  });

  it('reads the ISO form', () => {
    expect(normalizeDay('2026-08-27')).toBe('2026-08-27');
    expect(normalizeDay('2026/8/7')).toBe('2026-08-07');
  });

  it('falls back to day-first only when the first number cannot be a month', () => {
    expect(normalizeDay('27/08/2026')).toBe('2026-08-27');
    // 03/04 is genuinely ambiguous, so it stays month-first.
    expect(normalizeDay('03/04/2026')).toBe('2026-03-04');
  });

  it('reads a two-digit year as this century', () => {
    expect(normalizeDay('08/27/26')).toBe('2026-08-27');
  });

  it('reads month names in either order', () => {
    expect(normalizeDay('27 August 2026')).toBe('2026-08-27');
    expect(normalizeDay('Aug 27, 2026')).toBe('2026-08-27');
  });

  it('refuses a date that does not exist rather than rolling it forward', () => {
    expect(normalizeDay('02/30/2026')).toBeUndefined();
    expect(normalizeDay('13/13/2026')).toBeUndefined();
  });

  it('refuses prose, empty cells and half-written dates', () => {
    expect(normalizeDay('tomorrow')).toBeUndefined();
    expect(normalizeDay('  ')).toBeUndefined();
    expect(normalizeDay('08/2026')).toBeUndefined();
  });
});

describe('normalizeMinutes', () => {
  it('reads a 12-hour clock, including both noons', () => {
    expect(normalizeMinutes('9:00 AM')).toBe(540);
    expect(normalizeMinutes('2:30 pm')).toBe(870);
    expect(normalizeMinutes('12:00 AM')).toBe(0);
    expect(normalizeMinutes('12:00 PM')).toBe(720);
    expect(normalizeMinutes('7am')).toBe(420);
  });

  it('reads a 24-hour clock, with or without seconds', () => {
    expect(normalizeMinutes('14:30')).toBe(870);
    expect(normalizeMinutes('09:05:00')).toBe(545);
    expect(normalizeMinutes('0:00')).toBe(0);
    expect(normalizeMinutes('1430')).toBe(870);
  });

  it('reads noon and midnight said in words', () => {
    expect(normalizeMinutes('noon')).toBe(720);
    expect(normalizeMinutes('midnight')).toBe(0);
  });

  it('gives back nothing for an empty cell, which is how all-day looks', () => {
    expect(normalizeMinutes('')).toBeUndefined();
    expect(normalizeMinutes('   ')).toBeUndefined();
  });

  it('refuses clocks that do not exist', () => {
    expect(normalizeMinutes('25:00')).toBeUndefined();
    expect(normalizeMinutes('13:00 pm')).toBeUndefined();
    expect(normalizeMinutes('9:75')).toBeUndefined();
    expect(normalizeMinutes('lunchtime')).toBeUndefined();
  });
});

describe('parseDateTime', () => {
  it('pulls an ISO instant into the couple’s own zone', () => {
    // 02:30 UTC is still the evening before in Los Angeles.
    expect(parseDateTime('2026-08-27T02:30:00Z', LA)).toEqual({ day: '2026-08-26', minutes: 1170 });
    expect(parseDateTime('2026-08-27T02:30:00Z', 'Europe/Berlin')).toEqual({
      day: '2026-08-27', minutes: 270,
    });
  });

  it('reads a zoneless timestamp as the wall clock it plainly is', () => {
    expect(parseDateTime('2026-08-27T14:30:00', LA)).toEqual({ day: '2026-08-27', minutes: 870 });
    expect(parseDateTime('08/27/2026 2:30 PM', LA)).toEqual({ day: '2026-08-27', minutes: 870 });
  });

  it('reads a date on its own as a day with no time', () => {
    expect(parseDateTime('08/27/2026', LA)).toEqual({ day: '2026-08-27', minutes: undefined });
  });

  it('gives back nothing when the date half is unreadable', () => {
    expect(parseDateTime('sometime soon', LA)).toBeUndefined();
  });
});

describe('stableEventId', () => {
  const AT_NINE = { day: '2026-08-27', title: 'Standup', startsAt: 540 };

  it('gives the same row the same id every time', () => {
    expect(stableEventId(MEMBER, AT_NINE)).toBe(stableEventId(MEMBER, AT_NINE));
  });

  it('ignores the casing and spacing a calendar may have changed', () => {
    expect(stableEventId(MEMBER, { ...AT_NINE, title: '  STAND  UP ' }))
      .toBe(stableEventId(MEMBER, { ...AT_NINE, title: 'stand up' }));
  });

  it('separates rows that differ in member, day, title or start time', () => {
    const ids = new Set([
      stableEventId(MEMBER, AT_NINE),
      stableEventId('m2', AT_NINE),
      stableEventId(MEMBER, { ...AT_NINE, day: '2026-08-28' }),
      stableEventId(MEMBER, { ...AT_NINE, title: 'Standup!' }),
      stableEventId(MEMBER, { ...AT_NINE, startsAt: 600 }),
      stableEventId(MEMBER, { day: AT_NINE.day, title: AT_NINE.title }),
    ]);
    expect(ids.size).toBe(6);
  });

  it('is a plain id string a Dexie row can carry', () => {
    expect(stableEventId(MEMBER, AT_NINE)).toMatch(/^csv-[0-9a-f]{16}$/);
  });
});

describe('parseCalendarCsv', () => {
  it('reads a Google export, quoted commas and wrapped fields and all', () => {
    const { events } = parseCalendarCsv(GOOGLE_EXPORT, OPTIONS);
    expect(events.map((e) => [e.day, e.title, e.startsAt, e.endsAt])).toEqual([
      ['2026-08-27', 'Standup, then coffee', 540, 570],
      ['2026-08-29', 'Anniversary', undefined, undefined],
    ]);
  });

  it('refuses the rows it cannot read and says which line they were on', () => {
    const { problems } = parseCalendarCsv(GOOGLE_EXPORT, OPTIONS);
    expect(problems.map((p) => p.line)).toEqual([5, 6]);
    expect(problems[0].reason).toBe('no event name');
    expect(problems[1].reason).toContain('tomorrow');
  });

  it('reads an Outlook export with its own column order and 24-hour clock', () => {
    const { events } = parseCalendarCsv(OUTLOOK_EXPORT, OPTIONS);
    expect(events[0]).toMatchObject({ day: '2026-09-01', title: 'Physio', startsAt: 870, endsAt: 930 });
  });

  it('spreads a multi-day all-day event across every day it covers', () => {
    const { events } = parseCalendarCsv(OUTLOOK_EXPORT, OPTIONS);
    const trip = events.filter((e) => e.title === 'Trip to the coast');
    expect(trip.map((e) => e.day)).toEqual(['2026-09-04', '2026-09-05', '2026-09-06']);
    expect(trip.every((e) => e.startsAt === undefined)).toBe(true);
  });

  it('gives every row of the same file the same ids twice running', () => {
    const first = parseCalendarCsv(GOOGLE_EXPORT, OPTIONS).events.map((e) => e.id);
    const again = parseCalendarCsv(GOOGLE_EXPORT, OPTIONS).events.map((e) => e.id);
    expect(again).toEqual(first);
  });

  it('collapses a row repeated inside one file and counts what it collapsed', () => {
    const doubled = [
      'Subject,Start Date,Start Time',
      'Standup,08/27/2026,9:00 AM',
      'Standup,08/27/2026,9:00 AM',
    ].join('\n');
    const { events, duplicates } = parseCalendarCsv(doubled, OPTIONS);
    expect(events).toHaveLength(1);
    expect(duplicates).toBe(1);
  });

  it('treats a row with no start time as all day, whatever the flag says', () => {
    const csv = 'Subject,Start Date,Start Time,All Day Event\nBirthday,08/29/2026,,False';
    expect(parseCalendarCsv(csv, OPTIONS).events[0].startsAt).toBeUndefined();
  });

  it('drops an end time that is not on the same day or not after the start', () => {
    const csv = [
      'Subject,Start Date,Start Time,End Date,End Time',
      'Night shift,08/27/2026,10:00 PM,08/28/2026,6:00 AM',
      'Backwards,08/27/2026,10:00 AM,08/27/2026,9:00 AM',
    ].join('\n');
    const events = parseCalendarCsv(csv, OPTIONS).events;
    expect(events.every((e) => e.endsAt === undefined)).toBe(true);
    expect(events.map((e) => e.startsAt)).toEqual([600, 1320]);
  });

  it('reads an end time whose date column is empty or absent', () => {
    const noColumn = 'Subject,Date,Start Time,End Time\nStandup,08/27/2026,9:00 AM,9:30 AM';
    expect(parseCalendarCsv(noColumn, OPTIONS).events[0]).toMatchObject({ startsAt: 540, endsAt: 570 });

    const blankCell = [
      'Subject,Start Date,Start Time,End Date,End Time',
      'Standup,08/27/2026,9:00 AM,,9:30 AM',
    ].join('\n');
    expect(parseCalendarCsv(blankCell, OPTIONS).events[0]).toMatchObject({ startsAt: 540, endsAt: 570 });
  });

  it('still refuses an end date it cannot read rather than assuming the start day', () => {
    const csv = [
      'Subject,Start Date,Start Time,End Date,End Time',
      'Standup,08/27/2026,9:00 AM,whenever,9:30 AM',
    ].join('\n');
    expect(parseCalendarCsv(csv, OPTIONS).events[0].endsAt).toBeUndefined();
  });

  it('says nothing about the empty rows a spreadsheet leaves at the end', () => {
    const csv = `${toCalendarCsv([ROUND_TRIP[1]])},,,,,\r\n,,,,,\r\n`;
    const { events, problems } = parseCalendarCsv(csv, OPTIONS);
    expect(problems).toEqual([]);
    expect(events).toHaveLength(1);
  });

  it('reads a single combined Start column, zone and all', () => {
    const csv = 'Subject,Start,End\nStandup,2026-08-27T02:30:00Z,2026-08-27T03:00:00Z';
    expect(parseCalendarCsv(csv, OPTIONS).events[0]).toMatchObject({
      day: '2026-08-26', startsAt: 1170, endsAt: 1200,
    });
  });

  it('refuses a file that is not a calendar rather than importing noise', () => {
    const { events, problems } = parseCalendarCsv('name,email\nSam,sam@example.com', OPTIONS);
    expect(events).toEqual([]);
    expect(problems[0].reason).toContain('Subject');
  });

  it('says so plainly when the file is empty', () => {
    expect(parseCalendarCsv('', OPTIONS).problems[0].reason).toBe('the file is empty');
  });

  it('finds nothing to import, and nothing to complain about, in a header-only file', () => {
    const { events, problems } = parseCalendarCsv('Subject,Start Date\n', OPTIONS);
    expect(events).toEqual([]);
    expect(problems).toEqual([]);
  });
});

describe('csvCell', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvCell('Standup')).toBe('Standup');
  });

  it('quotes commas, quotes, newlines and edge whitespace', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(' padded ')).toBe('" padded "');
  });
});

describe('usDate', () => {
  it('writes a day the way a calendar expects to be handed one', () => {
    expect(usDate('2026-08-27')).toBe('08/27/2026');
  });
});

describe('csvClock', () => {
  it('writes minutes as a 12-hour clock', () => {
    expect(csvClock(540)).toBe('9:00 AM');
    expect(csvClock(870)).toBe('2:30 PM');
    expect(csvClock(0)).toBe('12:00 AM');
    expect(csvClock(720)).toBe('12:00 PM');
  });
});

describe('toCalendarCsv', () => {
  it('writes the header every calendar knows how to read', () => {
    expect(toCalendarCsv([]).trim())
      .toBe('Subject,Start Date,Start Time,End Date,End Time,All Day Event');
  });

  it('marks an all-day event as such and leaves its times empty', () => {
    const line = toCalendarCsv([{ day: '2026-08-29', title: 'Anniversary' }]).split('\r\n')[1];
    expect(line).toBe('Anniversary,08/29/2026,,08/29/2026,,True');
  });

  it('quotes a title holding a comma, so it survives the trip', () => {
    const line = toCalendarCsv([ROUND_TRIP[0]]).split('\r\n')[1];
    expect(line).toBe('"Standup, then coffee",08/27/2026,9:00 AM,08/27/2026,9:30 AM,False');
  });

  it('ends every record with CRLF, as RFC 4180 asks', () => {
    expect(toCalendarCsv([ROUND_TRIP[1]]).endsWith('\r\n')).toBe(true);
  });

  it('comes back out of the parser exactly as it went in', () => {
    const { events, problems } = parseCalendarCsv(toCalendarCsv(ROUND_TRIP), OPTIONS);
    expect(problems).toEqual([]);
    expect(events.map((e) => ({
      day: e.day, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt,
    }))).toEqual([
      { day: '2026-08-27', title: 'Standup, then coffee', startsAt: 540, endsAt: 570 },
      { day: '2026-08-29', title: 'Anniversary', startsAt: undefined, endsAt: undefined },
      { day: '2026-09-01', title: 'A "quoted" thing', startsAt: 0, endsAt: undefined },
    ]);
  });

  it('keeps the ids stable across an export and a re-import', () => {
    const first = parseCalendarCsv(GOOGLE_EXPORT, OPTIONS).events;
    const again = parseCalendarCsv(toCalendarCsv(first), OPTIONS).events;
    expect(again.map((e) => e.id)).toEqual(first.map((e) => e.id));
  });
});

describe('loadGrade', () => {
  it('grades an empty day as no load at all', () => {
    expect(loadGrade(0)).toBe(0);
  });

  it('climbs one step at a time and then stops climbing', () => {
    expect([1, 2, 3, 4, 12].map(loadGrade)).toEqual([1, 2, 2, 3, 3]);
  });
});
