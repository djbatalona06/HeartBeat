import { describe, expect, it } from 'vitest';
import { addDays } from '../day';
import type { CycleEntry, DayKey } from '../types';
import {
  MAX_UNCERTAINTY_DAYS,
  MIN_UNCERTAINTY_DAYS,
  averageLutealLength,
  cycleLengths,
  daysLate,
  periodStartsFrom,
  predict,
} from './predict';

/** Period starts every `length` days, oldest first. */
function starts(first: DayKey, lengths: number[]): DayKey[] {
  const out = [first];
  for (const n of lengths) out.push(addDays(out[out.length - 1], n));
  return out;
}

function entry(day: DayKey, values: Partial<CycleEntry> = {}): CycleEntry {
  return { id: day, memberId: 'm', day, updatedAt: 0, ...values };
}

describe('cycleLengths', () => {
  it('measures the gaps between consecutive starts', () => {
    expect(cycleLengths(starts('2026-01-01', [28, 30, 27]))).toEqual([28, 30, 27]);
  });

  it('drops gaps that are data entry rather than biology', () => {
    // A mistyped year and a same-week duplicate both have to go, or they land
    // in the median and move every date downstream of it.
    const days = ['2026-01-01', '2026-01-03', '2026-01-31', '2029-03-02'];
    expect(cycleLengths(days)).toEqual([28]);
  });

  it('has nothing to say about a single start', () => {
    expect(cycleLengths(['2026-01-01'])).toEqual([]);
  });
});

describe('predict', () => {
  it('says so plainly when there is no history', () => {
    const p = predict({ periodStarts: [], today: '2026-03-01' });
    expect(p.source).toBe('insufficient-data');
    expect(p.nextPeriodStart).toBeNull();
    expect(p.cycleDay).toBeNull();
  });

  it('will not forecast from one period start', () => {
    const p = predict({ periodStarts: ['2026-03-01'], today: '2026-03-05' });
    expect(p.source).toBe('insufficient-data');
    expect(p.nextPeriodStart).toBeNull();
    // It can still say where in the cycle today is, which is the one thing one
    // start does establish.
    expect(p.cycleDay).toBe(5);
  });

  it('projects the median cycle forward from the last start', () => {
    // Starts on 2026-01-01, 01-29, 02-26, 03-26.
    const p = predict({ periodStarts: starts('2026-01-01', [28, 28, 28]), today: '2026-04-05' });
    expect(p.source).toBe('calendar');
    expect(p.averageCycleLength).toBe(28);
    expect(p.nextPeriodStart).toBe('2026-04-23');
    expect(p.cyclesObserved).toBe(3);
  });

  it('takes the median, so one odd cycle does not drag the estimate', () => {
    // A mean would land on 33 and push the date five days out on the strength
    // of one illness.
    const p = predict({
      periodStarts: starts('2026-01-01', [28, 29, 28, 28, 56]),
      today: '2026-06-25',
    });
    expect(p.averageCycleLength).toBe(28);
  });

  it('anchors to a dated ovulation when there is one this cycle', () => {
    const periodStarts = starts('2026-01-01', [28, 28, 28]);
    const last = periodStarts[periodStarts.length - 1];
    const p = predict({
      periodStarts,
      ovulations: [addDays(last, 18)],
      today: addDays(last, 20),
    });
    expect(p.source).toBe('luteal');
    // Luteal-anchored: ovulation plus the luteal length, not last start plus 28.
    expect(p.nextPeriodStart).toBe(addDays(last, 32));
    expect(p.ovulationDate).toBe(addDays(last, 18));
  });

  it('ignores an ovulation belonging to an earlier cycle', () => {
    const periodStarts = starts('2026-01-01', [28, 28]);
    const p = predict({
      periodStarts,
      ovulations: ['2026-01-15'],
      today: '2026-03-05',
    });
    expect(p.source).toBe('calendar');
  });

  it('puts the fertile window before ovulation, not after it', () => {
    const p = predict({ periodStarts: starts('2026-01-01', [28, 28, 28]), today: '2026-04-05' });
    const w = p.fertileWindow!;
    expect(w.start).toBe(addDays(p.ovulationDate!, -5));
    expect(w.end).toBe(addDays(p.ovulationDate!, 1));
  });

  it('refuses to forecast from a history that stopped months ago', () => {
    // Last start 2026-02-26; today is more than ninety days past it.
    const p = predict({ periodStarts: starts('2026-01-01', [28, 28]), today: '2026-09-01' });
    expect(p.source).toBe('stale-history');
    expect(p.nextPeriodStart).toBeNull();
  });

  it('reports a period as late rather than moving the date', () => {
    // Last start 2026-03-26, so the estimate is 2026-04-23. Five days past it
    // the date must not have quietly slid forward to stay in the future.
    const periodStarts = starts('2026-01-01', [28, 28, 28]);
    const p = predict({ periodStarts, today: '2026-04-28' });
    expect(p.nextPeriodStart).toBe('2026-04-23');
    expect(daysLate(p, '2026-04-28')).toBe(5);
  });

  describe('uncertainty', () => {
    it('never claims a single day, however clean the history looks', () => {
      // Four identical cycles: the spread is genuinely zero, and two days is
      // still the most honest thing to say.
      const p = predict({ periodStarts: starts('2026-01-01', [28, 28, 28, 28]), today: '2026-05-01' });
      expect(p.cyclesObserved).toBe(4);
      expect(p.uncertaintyDays).toBe(MIN_UNCERTAINTY_DAYS);
    });

    it('is wider on two cycles than on six of the same regularity', () => {
      const thin = predict({ periodStarts: starts('2026-01-01', [28, 28]), today: '2026-03-05' });
      const thick = predict({
        periodStarts: starts('2026-01-01', [28, 28, 28, 28, 28, 28]),
        today: '2026-06-30',
      });
      expect(thin.uncertaintyDays).toBeGreaterThan(thick.uncertaintyDays);
    });

    it('widens as the cycles themselves scatter', () => {
      const steady = predict({ periodStarts: starts('2026-01-01', [28, 28, 28, 28]), today: '2026-05-01' });
      const scattered = predict({ periodStarts: starts('2026-01-01', [22, 35, 25, 38]), today: '2026-05-10' });
      expect(scattered.uncertaintyDays).toBeGreaterThan(steady.uncertaintyDays);
    });
  });
});

describe('averageLutealLength', () => {
  it('measures it from ovulations that sit inside a completed cycle', () => {
    const periodStarts = ['2026-01-01', '2026-01-29', '2026-02-26'];
    expect(averageLutealLength(periodStarts, ['2026-01-15', '2026-02-12'])).toBe(14);
  });

  it('has nothing to measure without a following period start', () => {
    expect(averageLutealLength(['2026-01-01'], ['2026-01-15'])).toBeNull();
  });
});

describe('periodStartsFrom', () => {
  it('takes the first bleeding day of a run', () => {
    const log = ['2026-03-01', '2026-03-02', '2026-03-03'].map((d) => entry(d, { flow: 'medium' }));
    expect(periodStartsFrom(log)).toEqual(['2026-03-01']);
  });

  it('does not split a period across a day that went unlogged', () => {
    // Day two unlogged. Treating day three as a new period would report a
    // two-day cycle and poison every average downstream.
    const log = [
      entry('2026-03-01', { flow: 'heavy' }),
      entry('2026-03-03', { flow: 'light' }),
      entry('2026-03-04', { flow: 'light' }),
    ];
    expect(periodStartsFrom(log)).toEqual(['2026-03-01']);
  });

  it('separates two runs a month apart', () => {
    const log = [
      entry('2026-03-01', { flow: 'medium' }),
      entry('2026-03-02', { flow: 'medium' }),
      entry('2026-03-29', { flow: 'medium' }),
    ];
    expect(periodStartsFrom(log)).toEqual(['2026-03-01', '2026-03-29']);
  });

  it('honours an explicit start even mid-run', () => {
    const log = [
      entry('2026-03-01', { flow: 'medium' }),
      entry('2026-03-02', { flow: 'medium', periodStart: true }),
    ];
    expect(periodStartsFrom(log)).toEqual(['2026-03-01', '2026-03-02']);
  });

  it('ignores days logged without any bleeding', () => {
    const log = [entry('2026-03-01', { symptoms: ['Cramps'], checkInComplete: true })];
    expect(periodStartsFrom(log)).toEqual([]);
  });
});

/**
 * A seeded sweep over generated histories.
 *
 * The invariants are what a screen is entitled to assume. A prediction that
 * violates one of these is wrong in a way no single worked example would catch,
 * because the failure lives in some particular combination of scatter and
 * history length rather than in the arithmetic.
 */
describe('invariants across generated histories', () => {
  function rng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  it('holds over 400 histories', () => {
    const random = rng(20260829);
    for (let n = 0; n < 400; n++) {
      const count = 1 + Math.floor(random() * 9);
      const centre = 21 + Math.floor(random() * 14);
      const scatter = Math.floor(random() * 9);
      const lengths: number[] = [];
      for (let i = 0; i < count; i++) {
        lengths.push(centre + Math.round((random() - 0.5) * 2 * scatter));
      }
      const periodStarts = starts('2026-01-01', lengths);
      const last = periodStarts[periodStarts.length - 1];
      const today = addDays(last, Math.floor(random() * 30));
      const withOvulation = random() < 0.5;
      const p = predict({
        periodStarts,
        ovulations: withOvulation ? [addDays(last, 12 + Math.floor(random() * 6))] : [],
        today,
      });

      const where = `seed run ${n}: ${JSON.stringify({ lengths, today, source: p.source })}`;

      // The band is always sayable, and always within the clamp.
      expect(p.uncertaintyDays, where).toBeGreaterThanOrEqual(MIN_UNCERTAINTY_DAYS);
      expect(p.uncertaintyDays, where).toBeLessThanOrEqual(MAX_UNCERTAINTY_DAYS);

      if (p.source === 'insufficient-data' || p.source === 'stale-history') {
        // Nothing is asserted that was not earned.
        expect(p.nextPeriodStart, where).toBeNull();
        expect(p.fertileWindow, where).toBeNull();
        continue;
      }

      expect(p.nextPeriodStart, where).not.toBeNull();
      expect(p.ovulationDate, where).not.toBeNull();

      // The next period is ahead of the last one, never behind it.
      expect(daysBetweenSafe(last, p.nextPeriodStart!), where).toBeGreaterThan(0);

      // Ovulation precedes the period it belongs to, by a plausible luteal phase.
      const luteal = daysBetweenSafe(p.ovulationDate!, p.nextPeriodStart!);
      expect(luteal, where).toBeGreaterThanOrEqual(7);
      expect(luteal, where).toBeLessThanOrEqual(20);

      // The fertile window brackets ovulation and reads forwards.
      const w = p.fertileWindow!;
      expect(daysBetweenSafe(w.start, w.end), where).toBeGreaterThan(0);
      expect(daysBetweenSafe(w.start, p.ovulationDate!), where).toBeGreaterThanOrEqual(0);
      expect(daysBetweenSafe(p.ovulationDate!, w.end), where).toBeGreaterThanOrEqual(0);

      // A cycle day, where one is reported, is a cycle day and not a running total.
      if (p.cycleDay !== null) {
        expect(p.cycleDay, where).toBeGreaterThanOrEqual(1);
        expect(p.cycleDay, where).toBeLessThanOrEqual(91);
      }
    }
  });

  function daysBetweenSafe(from: DayKey, to: DayKey): number {
    const parse = (s: DayKey) => {
      const [y, m, d] = s.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    };
    return Math.round((parse(to) - parse(from)) / 86400000);
  }
});
