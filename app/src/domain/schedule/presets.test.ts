import { describe, expect, it } from 'vitest';
import {
  instantAtHour,
  monthGrid,
  nextSaturday,
  presetsFor,
  shiftMonth,
  slotsFor,
} from './presets';

const LA = 'America/Los_Angeles';
const TOKYO = 'Asia/Tokyo';

/** What wall-clock time an instant reads as, in a zone. */
const hourIn = (at: number, tz: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false })
    .format(new Date(at)));
const dayIn = (at: number, tz: string) =>
  new Date(at).toLocaleDateString('en-CA', { timeZone: tz });

describe('instantAtHour', () => {
  it('lands on the wall-clock hour in the zone, not in UTC', () => {
    const at = instantAtHour('2026-09-06', 20, LA);
    expect(hourIn(at, LA)).toBe(20);
    expect(dayIn(at, LA)).toBe('2026-09-06');
  });

  it('works ahead of UTC too', () => {
    const at = instantAtHour('2026-09-06', 9, TOKYO);
    expect(hourIn(at, TOKYO)).toBe(9);
    expect(dayIn(at, TOKYO)).toBe('2026-09-06');
  });

  it('survives the spring-forward boundary', () => {
    // 8pm on the day the clocks go forward is not a fixed offset from midnight
    // UTC, which is exactly what string arithmetic gets wrong.
    const at = instantAtHour('2026-03-08', 20, LA);
    expect(hourIn(at, LA)).toBe(20);
    expect(dayIn(at, LA)).toBe('2026-03-08');
  });

  it('survives the autumn boundary', () => {
    const at = instantAtHour('2026-11-01', 20, LA);
    expect(hourIn(at, LA)).toBe(20);
    expect(dayIn(at, LA)).toBe('2026-11-01');
  });
});

describe('presetsFor', () => {
  const morningInLa = Date.parse('2026-09-06T16:00:00Z'); // 09:00 in LA

  it('keeps its shape through the day rather than losing rows', () => {
    const early = presetsFor(morningInLa, LA);
    const late = presetsFor(Date.parse('2026-09-07T05:00:00Z'), LA); // 22:00 in LA
    // A row that changes length through the day is harder to use than one that
    // greys out, so "tonight" goes null rather than disappearing.
    expect(early).toHaveLength(late.length);
    expect(early.find((p) => p.id === 'tonight')!.at).not.toBeNull();
    expect(late.find((p) => p.id === 'tonight')!.at).toBeNull();
  });

  it('offers tonight at the evening hour, in the member zone', () => {
    const tonight = presetsFor(morningInLa, LA).find((p) => p.id === 'tonight')!;
    expect(hourIn(tonight.at!, LA)).toBe(20);
    expect(dayIn(tonight.at!, LA)).toBe('2026-09-06');
  });

  it('puts tomorrow morning on the next day', () => {
    const p = presetsFor(morningInLa, LA).find((p) => p.id === 'tomorrow-morning')!;
    expect(dayIn(p.at!, LA)).toBe('2026-09-07');
    expect(hourIn(p.at!, LA)).toBe(9);
  });

  it('never offers a moment already gone', () => {
    for (const p of presetsFor(morningInLa, LA)) {
      if (p.at !== null) expect(p.at).toBeGreaterThan(morningInLa);
    }
  });
});

describe('nextSaturday', () => {
  it('finds the coming Saturday', () => {
    expect(nextSaturday('2026-09-06')).toBe('2026-09-12'); // a Sunday
    expect(nextSaturday('2026-09-11')).toBe('2026-09-12'); // a Friday
  });

  it('never returns the same day, so "this weekend" is not today', () => {
    expect(nextSaturday('2026-09-12')).toBe('2026-09-19'); // a Saturday
  });
});

describe('monthGrid', () => {
  it('pads to whole weeks from Monday', () => {
    const cells = monthGrid('2026-09-06');
    expect(cells.length % 7).toBe(0);
    // 1 September 2026 is a Tuesday, so one blank leads.
    expect(cells[0]).toBeNull();
    expect(cells[1]).toBe('2026-09-01');
  });

  it('holds every day of the month exactly once', () => {
    const days = monthGrid('2026-02-15').filter(Boolean);
    expect(days).toHaveLength(28);
    expect(new Set(days).size).toBe(28);
  });

  it('handles a leap February', () => {
    expect(monthGrid('2028-02-10').filter(Boolean)).toHaveLength(29);
  });
});

describe('shiftMonth', () => {
  it('moves forward and back', () => {
    expect(shiftMonth('2026-09-06', 1)).toBe('2026-10-06');
    expect(shiftMonth('2026-01-06', -1)).toBe('2025-12-06');
  });

  it('clamps onto a shorter month rather than overflowing into the next', () => {
    // The classic: 31 January minus a month is not 3 March.
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftMonth('2026-03-31', -1)).toBe('2026-02-28');
  });
});

describe('slotsFor', () => {
  const noonInLa = Date.parse('2026-09-06T19:00:00Z'); // 12:00 in LA

  it('offers a full day for a day still ahead', () => {
    expect(slotsFor('2026-09-08', noonInLa, LA)).toHaveLength(48);
  });

  it('drops the hours already gone today', () => {
    const slots = slotsFor('2026-09-06', noonInLa, LA);
    // A scrollable column of times you cannot pick is a column of dead rows.
    expect(slots.every((at) => at > noonInLa)).toBe(true);
    expect(slots.length).toBeLessThan(48);
    expect(hourIn(slots[0], LA)).toBeGreaterThanOrEqual(12);
  });

  it('offers nothing for a day already over', () => {
    expect(slotsFor('2026-09-01', noonInLa, LA)).toEqual([]);
  });
});
