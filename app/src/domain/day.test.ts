import { describe, expect, it } from 'vitest';
import {
  addDays, dayKey, daysBetween, daysInMonth, isoWeekOf, monthOf, shiftMonth, startOfWeek, sundayIndex, weekOf, weekdayIndex,
} from './day';

const LA = 'America/Los_Angeles';

describe('dayKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-09-25T19:00:00Z'), LA)).toBe('2026-09-25');
  });

  it('uses the zone, not UTC, near midnight', () => {
    // 06:30 UTC is still the previous evening in Los Angeles.
    expect(dayKey(new Date('2026-09-26T06:30:00Z'), LA)).toBe('2026-09-25');
    expect(dayKey(new Date('2026-09-26T06:30:00Z'), 'UTC')).toBe('2026-09-26');
  });

  it('survives the spring-forward boundary', () => {
    // 2026-03-08 is when US Pacific loses an hour.
    expect(dayKey(new Date('2026-03-08T09:30:00Z'), LA)).toBe('2026-03-08');
    expect(dayKey(new Date('2026-03-08T11:30:00Z'), LA)).toBe('2026-03-08');
  });

  it('survives the autumn fall-back boundary', () => {
    expect(dayKey(new Date('2026-11-01T08:30:00Z'), LA)).toBe('2026-11-01');
  });
});

describe('addDays', () => {
  it('moves forward and back', () => {
    expect(addDays('2026-09-25', 1)).toBe('2026-09-26');
    expect(addDays('2026-09-25', -1)).toBe('2026-09-24');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('does not drift across a DST boundary', () => {
    // Arithmetic is in UTC on purpose; a local-time Date would land on the
    // same calendar day when the clocks shift.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });
});

describe('daysBetween', () => {
  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-09-25', '2026-09-28')).toBe(3);
    expect(daysBetween('2026-09-28', '2026-09-25')).toBe(-3);
    expect(daysBetween('2026-09-25', '2026-09-25')).toBe(0);
  });

  it('counts correctly across a DST boundary', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('isoWeekOf', () => {
  // 2026-01-01 is a Thursday, so it is week 1 by definition -- the week
  // containing the year's first Thursday always is.
  it('puts the first Thursday of the year in week 1', () => {
    expect(isoWeekOf('2026-01-01')).toBe(1);
  });

  // 2026 has 53 ISO weeks, because its January 1st is a Thursday. December
  // 31st, 2026 is also a Thursday -- exactly 52 weeks after the first -- so it
  // falls in the year's 53rd and final week.
  it('gives a year with a Thursday January 1st a 53rd week', () => {
    expect(isoWeekOf('2026-12-31')).toBe(53);
  });

  // The Monday that starts week 1 of 2026 falls in the calendar year before
  // it -- the ISO week owns the day, not the calendar year printed on it.
  it('can put a December day in week 1 of the following year', () => {
    expect(isoWeekOf('2025-12-29')).toBe(1);
  });

  it('agrees with itself -- the whole point, so two unsynced phones land on the same rotating pair', () => {
    expect(isoWeekOf('2026-09-25')).toBe(isoWeekOf('2026-09-25'));
  });
});

describe('weekdayIndex', () => {
  it('counts from Monday, like isoWeekOf', () => {
    // 2026-09-14 is a Monday.
    expect(weekdayIndex('2026-09-14')).toBe(0);
    expect(weekdayIndex('2026-09-15')).toBe(1);
    expect(weekdayIndex('2026-09-20')).toBe(6); // Sunday
  });
});

describe('startOfWeek', () => {
  it('finds the Monday', () => {
    expect(startOfWeek('2026-09-17')).toBe('2026-09-14');
  });

  it('leaves a Monday alone', () => {
    expect(startOfWeek('2026-09-14')).toBe('2026-09-14');
  });

  it('treats Sunday as the end of its week, not the start of the next', () => {
    // The trap in every Monday-start week implementation.
    expect(startOfWeek('2026-09-20')).toBe('2026-09-14');
  });

  it('crosses a month end', () => {
    // 2026-10-01 is a Thursday; its Monday is in September.
    expect(startOfWeek('2026-10-01')).toBe('2026-09-28');
  });

  it('crosses a year end', () => {
    // 2027-01-01 is a Friday.
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28');
  });
});

describe('weekOf', () => {
  it('is seven days, Monday first', () => {
    expect(weekOf('2026-09-17')).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16',
      '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
  });

  it('gives the same week for every day in it', () => {
    const week = weekOf('2026-09-14');
    for (const day of week) {
      expect(weekOf(day), `${day} landed in a different week`).toEqual(week);
    }
  });

  it('agrees with isoWeekOf about which week a day is in', () => {
    // The reason both live in this file: the wager counts a week and the strip
    // draws one, and they must not be able to disagree.
    for (const day of weekOf('2026-09-17')) {
      expect(isoWeekOf(day)).toBe(isoWeekOf('2026-09-17'));
    }
  });

  it('holds across a month end', () => {
    expect(weekOf('2026-10-01')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30',
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
  });
});

/**
 * The month-grid arithmetic, which `WorkPage` and `CyclePage` each held their
 * own byte-for-byte copy of. These are the calculations where a bug is quiet:
 * a grid whose lead padding is off by one still renders a plausible month.
 */
describe('monthOf', () => {
  it('is the YYYY-MM a day belongs to', () => {
    expect(monthOf('2026-09-20')).toBe('2026-09');
    expect(monthOf('2026-01-01')).toBe('2026-01');
  });
});

describe('sundayIndex', () => {
  it('counts from Sunday, unlike weekdayIndex', () => {
    // 2026-09-20 is a Sunday: 0 here, 6 on the Monday-start count.
    expect(sundayIndex('2026-09-20')).toBe(0);
    expect(sundayIndex('2026-09-14')).toBe(1); // Monday
    expect(sundayIndex('2026-09-19')).toBe(6); // Saturday
  });

  it('disagrees with weekdayIndex exactly as intended', () => {
    // Both are right, and naming them for the day they count from is what
    // stops the wrong one being reached for in a month grid.
    expect(sundayIndex('2026-09-14')).toBe(1);
    expect(weekdayIndex('2026-09-14')).toBe(0);
  });
});

describe('daysInMonth', () => {
  it('covers a 30-day month', () => {
    const days = daysInMonth('2026-09');
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-09-01');
    expect(days[29]).toBe('2026-09-30');
  });

  it('covers a 31-day month', () => {
    expect(daysInMonth('2026-01')).toHaveLength(31);
  });

  it('gets February right in a common year', () => {
    expect(daysInMonth('2026-02')).toHaveLength(28);
  });

  it('gets February right in a leap year', () => {
    expect(daysInMonth('2028-02')).toHaveLength(29);
    expect(daysInMonth('2028-02').at(-1)).toBe('2028-02-29');
  });

  it('gets the century rule right', () => {
    // 1900 is not a leap year; 2000 is. The rule a hand-written table forgets.
    expect(daysInMonth('1900-02')).toHaveLength(28);
    expect(daysInMonth('2000-02')).toHaveLength(29);
  });

  it('zero-pads every day key', () => {
    for (const day of daysInMonth('2026-09')) {
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('shiftMonth', () => {
  it('moves within a year', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-09', -1)).toBe('2026-08');
  });

  it('crosses a year end in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('moves more than a year', () => {
    expect(shiftMonth('2026-09', 12)).toBe('2027-09');
    expect(shiftMonth('2026-09', -12)).toBe('2025-09');
    expect(shiftMonth('2026-09', 16)).toBe('2028-01');
  });

  it('is its own inverse', () => {
    for (const month of ['2026-01', '2026-09', '2026-12']) {
      for (const delta of [1, -1, 7, -7, 25]) {
        expect(shiftMonth(shiftMonth(month, delta), -delta)).toBe(month);
      }
    }
  });

  it('stays a valid month every step of two years', () => {
    let month = '2026-01';
    for (let i = 0; i < 24; i += 1) {
      month = shiftMonth(month, 1);
      expect(month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(daysInMonth(month).length).toBeGreaterThan(27);
    }
  });
});
