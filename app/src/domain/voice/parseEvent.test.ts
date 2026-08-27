import { describe, expect, it } from 'vitest';
import { parseEvent } from './parseEvent';

// 2026-08-27 is a Thursday. Every relative case below is anchored to it.
const THU = '2026-08-27';

describe('parseEvent — days', () => {
  it('defaults to today when no day is said', () => {
    expect(parseEvent('coffee with Sam', THU).day).toBe(THU);
  });

  it('handles today, tonight, tomorrow and the day after', () => {
    expect(parseEvent('gym today', THU).day).toBe(THU);
    expect(parseEvent('dinner tonight', THU).day).toBe(THU);
    expect(parseEvent('gym tomorrow', THU).day).toBe('2026-08-28');
    expect(parseEvent('gym the day after tomorrow', THU).day).toBe('2026-08-29');
  });

  it('moves a bare weekday forward to the coming one', () => {
    // Thursday → Friday is one day out.
    expect(parseEvent('dentist on friday', THU).day).toBe('2026-08-28');
    // Thursday → Tuesday wraps into next week.
    expect(parseEvent('dentist on tuesday', THU).day).toBe('2026-09-01');
  });

  it('reads "next <weekday>" as the week after the coming one', () => {
    expect(parseEvent('dentist next friday', THU).day).toBe('2026-09-04');
    expect(parseEvent('dentist next tuesday', THU).day).toBe('2026-09-08');
  });

  // Saying "Thursday" on a Thursday means the next one, not this morning.
  it('pushes today’s own weekday a full week out', () => {
    expect(parseEvent('standup on thursday', THU).day).toBe('2026-09-03');
  });

  it('reads a day of the month, rolling into next month when it has passed', () => {
    expect(parseEvent('rent due on the 30th', THU).day).toBe('2026-08-30');
    // The 3rd is behind the 27th, so it means September.
    expect(parseEvent('rent due on the 3rd', THU).day).toBe('2026-09-03');
  });

  it('rolls a December day-of-month into the next year', () => {
    expect(parseEvent('party on the 2nd', '2026-12-20').day).toBe('2027-01-02');
  });
});

describe('parseEvent — times', () => {
  const at = (s: string) => parseEvent(s, THU).startsAt;

  it('reads am and pm', () => {
    expect(at('gym at 7am')).toBe(7 * 60);
    expect(at('gym at 2pm')).toBe(14 * 60);
    expect(at('gym at 2:30pm')).toBe(14 * 60 + 30);
  });

  it('handles the 12 o’clock edges', () => {
    expect(at('lunch at 12pm')).toBe(12 * 60);
    expect(at('call at 12am')).toBe(0);
    expect(at('lunch at noon')).toBe(12 * 60);
    expect(at('call at midnight')).toBe(0);
  });

  it('reads 24-hour time literally', () => {
    expect(at('standup at 14:00')).toBe(14 * 60);
    expect(at('standup at 09:15')).toBe(9 * 60 + 15);
  });

  it('reads spoken half and quarter hours', () => {
    // 9 is outside the afternoon-nudge range, so it stays in the morning.
    expect(at('call at half past nine')).toBe(9 * 60 + 30);
    expect(at('call at half past nine am')).toBe(9 * 60 + 30);
    expect(at('call at half past nine pm')).toBe(21 * 60 + 30);
  });

  // The nudge shifts by twelve hours rather than rebuilding from the hour, so
  // the minutes survive it. Getting this wrong turns 6:15 into 6:00 silently.
  it('keeps the minutes when nudging a spoken time into the afternoon', () => {
    expect(at('call at quarter past six')).toBe(18 * 60 + 15);
    expect(at('call at quarter to six')).toBe(17 * 60 + 45);
    expect(at('call at half past two')).toBe(14 * 60 + 30);
  });

  it('reads hours spelled as words', () => {
    expect(at('dinner at seven')).toBe(19 * 60);
  });

  // "at 3" in a calendar overwhelmingly means the afternoon; "at 9" does not.
  it('nudges a bare 1–7 into the afternoon but leaves 8–11 alone', () => {
    expect(at('meeting at 3')).toBe(15 * 60);
    expect(at('meeting at 7')).toBe(19 * 60);
    expect(at('meeting at 9')).toBe(9 * 60);
    expect(at('meeting at 11')).toBe(11 * 60);
  });

  it('leaves startsAt undefined when no time was said', () => {
    expect(at('coffee with Sam tomorrow')).toBeUndefined();
  });
});

describe('parseEvent — titles', () => {
  it('keeps the title clean once day and time are cut out', () => {
    expect(parseEvent('dentist next tuesday at 2pm', THU)).toEqual({
      title: 'Dentist',
      day: '2026-09-08',
      startsAt: 14 * 60,
    });
  });

  it('strips the openers people say to a calendar', () => {
    expect(parseEvent('schedule a haircut tomorrow at 4pm', THU).title).toBe('Haircut');
    expect(parseEvent('add an appointment dentist on friday', THU).title).toBe('Dentist');
    expect(parseEvent('i have a meeting at 10am', THU).title).toBe('Meeting');
  });

  it('does not let a day-of-month be eaten as an hour', () => {
    const e = parseEvent('rent on the 14th at 2pm', THU);
    expect(e.day).toBe('2026-09-14');
    expect(e.startsAt).toBe(14 * 60);
    expect(e.title).toBe('Rent');
  });

  it('leaves no dangling preposition on the title', () => {
    expect(parseEvent('coffee with Sam at 3pm', THU).title).toBe('Coffee with Sam');
    expect(parseEvent('flight on friday', THU).title).toBe('Flight');
  });

  it('never returns a blank title', () => {
    for (const s of ['tomorrow', 'at 3pm', 'next tuesday', 'noon']) {
      expect(parseEvent(s, THU).title.trim().length).toBeGreaterThan(0);
    }
  });
});
