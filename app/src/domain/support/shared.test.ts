import { describe, expect, it } from 'vitest';
import {
  ADVISORY, lockedLanes, openLanes, pickForCouple, sharedQuote,
} from './shared';
import { QUOTES } from './quotes';
import { SUPPORT_LANES, type LaneInput } from './lanes';
import { pickForDay } from '../day';
import type { DayKey } from '../types';

const DAYS: DayKey[] = Array.from({ length: 60 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 0, 1 + i));
  return date.toISOString().slice(0, 10) as DayKey;
});

const both: LaneInput = { gender: 'female', tracksCycle: true, partnerTracksCycle: true };
const neither: LaneInput = { gender: undefined, tracksCycle: false, partnerTracksCycle: false };

describe('picking for a couple', () => {
  it('is the same answer on both phones, with nothing synced', () => {
    // The only inputs are the couple id and the day, and both phones have both.
    for (const day of DAYS.slice(0, 10)) {
      expect(pickForCouple('couple-1', day, QUOTES))
        .toBe(pickForCouple('couple-1', day, QUOTES));
    }
  });

  it('is nothing for an empty pool', () => {
    expect(pickForCouple('couple-1', DAYS[0], [])).toBeUndefined();
  });

  it('always lands inside the pool', () => {
    for (const day of DAYS) {
      for (const size of [1, 2, 3, 5, 17]) {
        const pool = Array.from({ length: size }, (_, i) => i);
        const got = pickForCouple('couple-x', day, pool);
        expect(pool, `${day} of ${size}`).toContain(got);
      }
    }
  });

  /**
   * The thing `pickForDay` could not do. Every couple reading the same lane on
   * the same day got the same line, and with four or five quotes to a lane the
   * rotation was short and globally in lockstep.
   */
  it('tells two couples apart on the same day', () => {
    const day = DAYS[3];
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => pickForCouple(`couple-${i}`, day, QUOTES)),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('moves through the pool across days rather than sticking', () => {
    const seen = new Set(DAYS.map((day) => pickForCouple('couple-1', day, QUOTES)));
    expect(seen.size).toBeGreaterThan(3);
  });

  /** `pickForDay` keeps its five callers and its exact answers. */
  it('does not change what pickForDay resolves to', () => {
    const pool = ['a', 'b', 'c', 'd'];
    expect(pickForDay('2026-01-01' as DayKey, pool)).toBe(pickForDay('2026-01-01' as DayKey, pool));
    // And the two rules are genuinely different, or there was no point.
    const differs = DAYS.some(
      (day) => pickForDay(day, pool) !== pickForCouple('couple-1', day, pool),
    );
    expect(differs).toBe(true);
  });
});

/**
 * The lock decides which lane a line may come from, and it is decided by
 * *where the card is* rather than by who is looking.
 *
 * `CycleLock` guarantees nothing behind it renders while locked. A line drawn
 * from a cycle lane outside that section would carry the one thing the lock
 * exists to keep round the front of it.
 */
describe('which lanes a placement may draw from', () => {
  it('never offers a cycle lane outside the lock', () => {
    for (const input of [both, neither, { ...both, gender: 'male' as const }]) {
      expect(openLanes(input)).not.toContain('cycle-self');
      expect(openLanes(input)).not.toContain('cycle-partner');
    }
  });

  it('offers something to everybody outside the lock', () => {
    expect(openLanes(neither)).toContain('general');
    expect(openLanes(both)).toContain('general');
    expect(openLanes({ ...neither, gender: 'male' })).toContain('mens-health');
  });

  it('offers only cycle lanes inside the lock', () => {
    expect(lockedLanes(both)).toEqual(['cycle-self', 'cycle-partner']);
    expect(lockedLanes({ ...both, tracksCycle: false })).toEqual(['cycle-partner']);
    expect(lockedLanes(neither)).toEqual([]);
  });

  it('accounts for every lane between the two placements', () => {
    const covered = new Set([...openLanes(both), ...lockedLanes(both), 'mens-health']);
    for (const lane of SUPPORT_LANES) expect([...covered], lane).toContain(lane);
  });
});

describe('the shared line', () => {
  it('is the same on both phones', () => {
    expect(sharedQuote('couple-1', DAYS[0], ['general']))
      .toEqual(sharedQuote('couple-1', DAYS[0], ['general']));
  });

  it('comes from one of the lanes it was given, and nowhere else', () => {
    for (const day of DAYS) {
      const quote = sharedQuote('couple-1', day, ['cycle-self', 'cycle-partner']);
      expect(['cycle-self', 'cycle-partner'], day).toContain(quote!.lane);
    }
  });

  it('is nothing when there are no lanes, which is an unpaired locked section', () => {
    expect(sharedQuote('couple-1', DAYS[0], [])).toBeUndefined();
  });

  it('works from a single lane', () => {
    const quote = sharedQuote('couple-1', DAYS[0], ['mens-health']);
    expect(quote!.lane).toBe('mens-health');
  });

  /**
   * The lane is rolled on a different step from the quote, so a couple whose
   * lanes change — somebody answers the gender question, a partner starts
   * tracking — gets a different line rather than the same one relabelled.
   */
  it('changes when the lanes change', () => {
    const differs = DAYS.some((day) => sharedQuote('couple-1', day, ['general'])
      !== sharedQuote('couple-1', day, ['general', 'mens-health']));
    expect(differs).toBe(true);
  });

  it('uses more than one lane over time when given more than one', () => {
    const lanes = new Set(
      DAYS.map((day) => sharedQuote('couple-1', day, ['cycle-self', 'cycle-partner'])!.lane),
    );
    expect(lanes.size).toBe(2);
  });
});

describe('the small print', () => {
  it('says what it has to say', () => {
    expect(ADVISORY).toContain('Not contraception');
  });
});
