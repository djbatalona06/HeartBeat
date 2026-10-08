import { describe, expect, it } from 'vitest';
import { PURSES, purseById } from './coinSources';
import {
  WHEEL_SEGMENTS, WHEEL_TOTAL, bossSpinSource, dailySpinSource, expectedCoins, restAngle, rollWheel,
  spinRoll, wheelOdds,
} from './wheel';

describe('the wheel', () => {
  /** The weights are published on the wedges, so they are pinned: moving one is a decision, not a drift. */
  it('has the weights it prints', () => {
    expect(WHEEL_SEGMENTS.map((s) => [s.id, s.weight])).toEqual([
      ['pinch', 45], ['small', 32], ['fat', 15], ['hoard', 7], ['jackpot', 1],
    ]);
    expect(WHEEL_TOTAL).toBe(100);
  });

  it('pays only purses that exist, and never nothing', () => {
    for (const segment of WHEEL_SEGMENTS) {
      expect(purseById(segment.purse), segment.id).toBeDefined();
      expect(purseById(segment.purse)!.coins).toBeGreaterThan(0);
      expect(segment.weight).toBeGreaterThan(0);
      expect(Number.isInteger(segment.weight)).toBe(true);
    }
    expect(PURSES.length).toBeGreaterThanOrEqual(WHEEL_SEGMENTS.length);
  });

  it('is rarer the bigger the prize', () => {
    const coins = WHEEL_SEGMENTS.map((s) => purseById(s.purse)!.coins);
    expect([...coins].sort((a, b) => a - b)).toEqual(coins);
    const weights = WHEEL_SEGMENTS.map((s) => s.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it('prints whole percents that add up to exactly 100', () => {
    const odds = wheelOdds();
    expect(odds.reduce((sum, o) => sum + o.percent, 0)).toBe(100);
    for (const o of odds) expect(Number.isInteger(o.percent)).toBe(true);
  });

  /** An evenly spaced sweep of [0, 1) is the exact long-run frequency, with no flake. */
  it('lands on each wedge as often as its printed percent says', () => {
    const N = 100000;
    const hits = new Map<string, number>();
    for (let i = 0; i < N; i += 1) {
      const id = rollWheel((i + 0.5) / N).id;
      hits.set(id, (hits.get(id) ?? 0) + 1);
    }
    for (const o of wheelOdds()) {
      expect((hits.get(o.segment.id) ?? 0) / N * 100).toBeCloseTo(o.percent, 1);
    }
  });

  it('handles the ends of the range', () => {
    expect(rollWheel(0).id).toBe('pinch');
    expect(rollWheel(0.999999999).id).toBe('jackpot');
    expect(rollWheel(-1).id).toBe('pinch');
    expect(rollWheel(7).id).toBe('jackpot');
  });

  /** A spin must never be a way to make money: the shop sells things for coins. */
  it('pays out on average well under what the cheapest chest costs', () => {
    expect(expectedCoins()).toBeLessThan(70);
    expect(expectedCoins()).toBeGreaterThan(30);
  });
});

describe('spinning', () => {
  it('is the same for the same member and source, on any phone', () => {
    const a = spinRoll('me', dailySpinSource('2026-10-08'));
    expect(spinRoll('me', dailySpinSource('2026-10-08'))).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it('differs by member and by source', () => {
    expect(spinRoll('me', 'a')).not.toBe(spinRoll('them', 'a'));
    expect(spinRoll('me', 'a')).not.toBe(spinRoll('me', 'b'));
  });

  it('names one spin a day and one per boss', () => {
    expect(dailySpinSource('2026-10-08')).not.toBe(dailySpinSource('2026-10-09'));
    expect(bossSpinSource('i1s7-x')).not.toBe(dailySpinSource('2026-10-08'));
  });

  it('rests at the centre of its wedge', () => {
    expect(restAngle(0, 4)).toBe(45);
    expect(restAngle(3, 4)).toBe(315);
  });
});
