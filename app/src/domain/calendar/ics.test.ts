import { describe, expect, it } from 'vitest';
import { icsFold, icsText, icsValue, parseCalendarIcs, toCalendarIcs, unfoldIcs } from './ics';

const AT = new Date('2026-09-27T04:15:00Z');

describe('icsText', () => {
  it('escapes the four characters that change meaning', () => {
    expect(icsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('reads escaped property values back into plain text', () => {
    expect(icsValue('a\\,b\\;c\\\\d\\ne')).toBe('a,b;c\\d\ne');
  });
});

describe('unfoldIcs', () => {
  it('joins a folded continuation onto the preceding property', () => {
    expect(unfoldIcs('SUMMARY:A very long\r\n title\r\nDTSTART:20261002T090000'))
      .toEqual([
        { line: 1, text: 'SUMMARY:A very longtitle' },
        { line: 3, text: 'DTSTART:20261002T090000' },
      ]);
  });
});

describe('icsFold', () => {
  it('leaves a short line alone', () => {
    expect(icsFold('SUMMARY:Dinner')).toBe('SUMMARY:Dinner');
  });

  it('folds at 75 octets, every continuation starting with a space', () => {
    const folded = icsFold(`SUMMARY:${'x'.repeat(200)}`);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    expect(new TextEncoder().encode(parts[0]).length).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) {
      expect(part.startsWith(' ')).toBe(true);
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(`SUMMARY:${'x'.repeat(200)}`);
  });

  it('never splits inside a multibyte character', () => {
    const title = `SUMMARY:${'💙'.repeat(40)}`;
    const unfolded = icsFold(title).split('\r\n').map((p, i) => (i === 0 ? p : p.slice(1))).join('');
    expect(unfolded).toBe(title);
  });
});

describe('toCalendarIcs', () => {
  it('writes a timed event as floating wall-clock time', () => {
    const ics = toCalendarIcs([{ id: 'e1', day: '2026-09-28', title: 'Dinner', startsAt: 19 * 60, endsAt: 21 * 60 }], AT);
    expect(ics).toContain('UID:e1@heartbeat');
    expect(ics).toContain('DTSTAMP:20260927T041500Z');
    expect(ics).toContain('DTSTART:20260928T190000');
    expect(ics).toContain('DTEND:20260928T210000');
    expect(ics).toContain('SUMMARY:Dinner');
  });

  it('writes an all-day event as dates, ending the day after', () => {
    const ics = toCalendarIcs([{ id: 'b', day: '2026-12-31', title: 'Birthday' }], AT);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('omits DTEND when the end is missing or not after the start', () => {
    const open = toCalendarIcs([{ id: 'a', day: '2026-09-28', title: 'A', startsAt: 600 }], AT);
    const backwards = toCalendarIcs([{ id: 'b', day: '2026-09-28', title: 'B', startsAt: 600, endsAt: 500 }], AT);
    expect(open).not.toContain('DTEND');
    expect(backwards).not.toContain('DTEND');
  });

  it('uses CRLF throughout, wraps in a VCALENDAR, and ends with a newline', () => {
    const ics = toCalendarIcs([{ id: 'a', day: '2026-09-28', title: 'A' }], AT);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('is stable: the same events give the same file, in day and time order', () => {
    const events = [
      { id: 'late', day: '2026-09-29', title: 'Later' },
      { id: 'early', day: '2026-09-28', title: 'Earlier' },
    ];
    expect(toCalendarIcs(events, AT)).toBe(toCalendarIcs([...events].reverse(), AT));
    expect(toCalendarIcs(events, AT).indexOf('Earlier')).toBeLessThan(toCalendarIcs(events, AT).indexOf('Later'));
  });

  it('escapes a title so it cannot break out of its line', () => {
    const ics = toCalendarIcs([{ id: 'x', day: '2026-09-28', title: 'Lunch, with;\nnew line' }], AT);
    expect(ics).toContain('SUMMARY:Lunch\\, with\\;\\nnew line');
  });
});

describe('parseCalendarIcs', () => {
  const OPTIONS = { memberId: 'me', timeZone: 'America/Los_Angeles' };

  it('imports timed events, using their provider UID as the stable key', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:dentist-42@example.com',
      'SUMMARY:Dentist\\, follow-up',
      'DTSTART:20261002T090000',
      'DTEND:20261002T093000',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const first = parseCalendarIcs(text, OPTIONS);
    const edited = parseCalendarIcs(text.replace('Dentist\\, follow-up', 'Dentist, moved'), OPTIONS);

    expect(first.problems).toEqual([]);
    expect(first.events[0]).toMatchObject({
      id: expect.stringMatching(/^ics-[0-9a-f]{16}$/),
      day: '2026-10-02', title: 'Dentist, follow-up', startsAt: 540, endsAt: 570,
    });
    expect(edited.events[0].id).toBe(first.events[0].id);
  });

  it('spreads an all-day event across its visible days, respecting exclusive DTEND', () => {
    const text = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:trip-7', 'SUMMARY:Trip',
      'DTSTART;VALUE=DATE:20261010', 'DTEND;VALUE=DATE:20261013',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\n');
    const { events } = parseCalendarIcs(text, OPTIONS);
    expect(events.map((event) => event.day)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    expect(events.every((event) => event.startsAt === undefined)).toBe(true);
  });

  it('converts a UTC timestamp into the member timezone', () => {
    const text = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Late flight',
      'DTSTART:20261002T003000Z', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\n');
    expect(parseCalendarIcs(text, OPTIONS).events[0]).toMatchObject({
      day: '2026-10-01', startsAt: 1050,
    });
  });

  it('refuses a file without an iCalendar envelope', () => {
    const preview = parseCalendarIcs('SUMMARY:Not a calendar', OPTIONS);
    expect(preview.events).toEqual([]);
    expect(preview.problems[0].reason).toContain('VCALENDAR');
  });
});
