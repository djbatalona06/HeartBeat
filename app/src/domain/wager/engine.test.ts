import { describe, expect, it } from 'vitest';
import {
  STAKE_PER_WORKOUT, WAGER_TARGETS, coversDay, daysLeft, endOfWager, isWagerTarget,
  markSettled, newWager, reckonWager, stakeFor, standingsOf, wagerIdFor,
} from './engine';
import type { Wager } from '../types';

const COUPLE = 'couple-1';
const HER = 'member-a';
const HIM = 'member-b';
const BOTH = [HER, HIM];
/** 2026-09-14 is a Monday; 2026-09-20 is its Sunday. */
const MONDAY = '2026-09-14';
const SUNDAY = '2026-09-20';

function wager(over: Partial<Wager> = {}): Wager {
  return {
    ...newWager({ coupleId: COUPLE, day: MONDAY, target: 3, now: 1000 }),
    ...over,
  };
}

describe('wagerIdFor', () => {
  /**
   * The reason a random id would be wrong: both phones compute this
   * independently on a Monday morning, and the upsert has to converge on one
   * row rather than leaving the couple holding two wagers for one week.
   */
  it('is the same on both phones for the same week', () => {
    expect(wagerIdFor(COUPLE, MONDAY)).toBe(wagerIdFor(COUPLE, MONDAY));
    expect(wagerIdFor(COUPLE, MONDAY)).toBe(`wager-${COUPLE}-${MONDAY}`);
  });

  it('differs by week and by couple', () => {
    expect(wagerIdFor(COUPLE, MONDAY)).not.toBe(wagerIdFor(COUPLE, '2026-09-21'));
    expect(wagerIdFor(COUPLE, MONDAY)).not.toBe(wagerIdFor('couple-2', MONDAY));
  });
});

describe('newWager', () => {
  it('normalises any day of the week to its Monday', () => {
    for (const day of ['2026-09-14', '2026-09-17', '2026-09-20']) {
      expect(newWager({ coupleId: COUPLE, day, target: 3, now: 1 }).weekStart).toBe(MONDAY);
    }
  });

  it('gives the same id whichever day of the week it is started on', () => {
    const monday = newWager({ coupleId: COUPLE, day: '2026-09-14', target: 3, now: 1 });
    const friday = newWager({ coupleId: COUPLE, day: '2026-09-18', target: 3, now: 1 });
    expect(friday.id).toBe(monday.id);
  });

  it('stakes more for a higher target, so lowballing is never better', () => {
    const low = newWager({ coupleId: COUPLE, day: MONDAY, target: 2, now: 1 });
    const high = newWager({ coupleId: COUPLE, day: MONDAY, target: 5, now: 1 });
    expect(high.stake).toBeGreaterThan(low.stake);
    expect(low.stake).toBe(2 * STAKE_PER_WORKOUT);
  });

  it('starts unsettled', () => {
    expect(newWager({ coupleId: COUPLE, day: MONDAY, target: 3, now: 1 }).settledAt)
      .toBeUndefined();
  });
});

describe('the week it covers', () => {
  it('ends on the Sunday', () => {
    expect(endOfWager({ weekStart: MONDAY })).toBe(SUNDAY);
  });

  it('covers every day from the Monday to the Sunday and none outside', () => {
    expect(coversDay({ weekStart: MONDAY }, '2026-09-13')).toBe(false);
    for (const day of ['2026-09-14', '2026-09-17', '2026-09-20']) {
      expect(coversDay({ weekStart: MONDAY }, day), day).toBe(true);
    }
    expect(coversDay({ weekStart: MONDAY }, '2026-09-21')).toBe(false);
  });

  it('counts the days left inclusively, and stops at zero', () => {
    expect(daysLeft({ weekStart: MONDAY }, MONDAY)).toBe(7);
    expect(daysLeft({ weekStart: MONDAY }, '2026-09-18')).toBe(3);
    expect(daysLeft({ weekStart: MONDAY }, SUNDAY)).toBe(1);
    expect(daysLeft({ weekStart: MONDAY }, '2026-09-21')).toBe(0);
  });

  it('reads a whole week when asked before it starts', () => {
    expect(daysLeft({ weekStart: MONDAY }, '2026-09-10')).toBe(7);
  });
});

describe('standingsOf', () => {
  it('reports each of them against the target', () => {
    const found = standingsOf({ target: 3 }, BOTH, { [HER]: 3, [HIM]: 1 });
    expect(found).toEqual([
      { memberId: HER, done: 3, met: true, short: 0 },
      { memberId: HIM, done: 1, met: false, short: 2 },
    ]);
  });

  it('never reports a negative shortfall for somebody who overshot', () => {
    expect(standingsOf({ target: 3 }, [HER], { [HER]: 9 })[0])
      .toEqual({ memberId: HER, done: 9, met: true, short: 0 });
  });

  /**
   * The trap this exists to avoid. A member who has not trained at all has no
   * row in the exercise table, so deriving the member list from the counts
   * would silently drop them -- and the wager would read as met by everybody
   * who happened to show up.
   */
  it('counts a member with no rows as zero rather than omitting them', () => {
    const found = standingsOf({ target: 3 }, BOTH, { [HER]: 3 });
    expect(found).toHaveLength(2);
    expect(found[1]).toEqual({ memberId: HIM, done: 0, met: false, short: 3 });
  });
});

describe('reckonWager', () => {
  it('is running while either of them is short', () => {
    const step = reckonWager(wager(), BOTH, { [HER]: 3, [HIM]: 1 }, '2026-09-17');
    expect(step).toEqual({ verb: 'running', short: 2 });
  });

  it('sums the shortfall across both of them', () => {
    const step = reckonWager(wager(), BOTH, { [HER]: 1, [HIM]: 0 }, '2026-09-17');
    expect(step).toEqual({ verb: 'running', short: 5 });
  });

  it('pays the moment they both arrive, not on the Sunday', () => {
    // Wednesday. Waiting for the week to end would land the reward in a
    // different week from the effort, on a Monday morning.
    const step = reckonWager(wager(), BOTH, { [HER]: 3, [HIM]: 3 }, '2026-09-16');
    expect(step).toEqual({ verb: 'won', award: stakeFor(3) });
  });

  it('is missed once the week is over and they did not', () => {
    const step = reckonWager(wager(), BOTH, { [HER]: 3, [HIM]: 2 }, '2026-09-21');
    expect(step).toEqual({ verb: 'missed' });
  });

  it('still pays a week finished on its last day', () => {
    // Completion is checked before expiry, exactly as the quest engine does,
    // so a wager finished on the Sunday is won rather than missed.
    const step = reckonWager(wager(), BOTH, { [HER]: 3, [HIM]: 3 }, SUNDAY);
    expect(step.verb).toBe('won');
  });

  /** The pay-once guard. Two callers reckon; only one of them pays. */
  it('refuses to settle twice', () => {
    const paid = markSettled(wager(), true, 5000);
    const step = reckonWager(paid, BOTH, { [HER]: 9, [HIM]: 9 }, '2026-09-17');
    expect(step).toEqual({ verb: 'settled', met: true });
  });

  it('remembers a settled wager that was missed', () => {
    const gone = markSettled(wager(), false, 5000);
    expect(reckonWager(gone, BOTH, {}, '2026-09-21')).toEqual({ verb: 'settled', met: false });
  });

  /**
   * Vacuous truth would pay out on a device that has not learned who the
   * couple are yet, which on a fresh install is the first thing that happens.
   */
  it('does not pay when it does not know who the couple are', () => {
    const step = reckonWager(wager(), [], {}, '2026-09-17');
    expect(step).toEqual({ verb: 'running', short: 0 });
  });
});

describe('markSettled', () => {
  it('stamps the time and moves updatedAt, so the row syncs', () => {
    const paid = markSettled(wager(), true, 5000);
    expect(paid.settledAt).toBe(5000);
    expect(paid.met).toBe(true);
    expect(paid.updatedAt).toBe(5000);
  });

  it('leaves the target and the stake alone', () => {
    const before = wager();
    const paid = markSettled(before, true, 5000);
    expect(paid.target).toBe(before.target);
    expect(paid.stake).toBe(before.stake);
    expect(paid.id).toBe(before.id);
  });
});

describe('the offered targets', () => {
  it('are all recognised, and nothing else is', () => {
    for (const target of WAGER_TARGETS) expect(isWagerTarget(target)).toBe(true);
    for (const bad of [0, 1, 6, 99, -3, 2.5]) expect(isWagerTarget(bad)).toBe(false);
  });

  it('each stake a whole number of XP', () => {
    for (const target of WAGER_TARGETS) expect(Number.isInteger(stakeFor(target))).toBe(true);
  });
});
