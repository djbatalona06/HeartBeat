import { describe, expect, it } from 'vitest';
import {
  FIGHT_TIMING, TOGETHER_BEATS, roundLength, strikePlan, togetherBeats, togetherRoundLength,
} from './strikePlan';

/** A round longer than this starts to feel like waiting for the game. */
const ROUND_CEILING_MS = 2500;

describe('fight round timing', () => {
  it('moves nothing and waits for nothing under calm', () => {
    const plan = strikePlan({ calm: true });
    for (const value of Object.values(plan)) expect(value).toBe(0);
    expect(roundLength(plan)).toBe(0);
  });

  it('plays the full round when not calm', () => {
    expect(strikePlan({ calm: false })).toEqual(FIGHT_TIMING);
  });

  it('keeps a whole round, skill included, under the ceiling', () => {
    expect(roundLength(strikePlan({ calm: false }))).toBeLessThan(ROUND_CEILING_MS);
  });

  describe('the couple\'s move', () => {
    it('lasts a second and a half, as asked', () => {
      expect(FIGHT_TIMING.together).toBe(1500);
    });

    it('splits into beats that add up to the whole move', () => {
      const total = Object.values(TOGETHER_BEATS).reduce((sum, fraction) => sum + fraction, 0);
      expect(total).toBeCloseTo(1, 10);
      const beats = togetherBeats(FIGHT_TIMING);
      expect(Object.values(beats).reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(FIGHT_TIMING.together, 6);
    });

    it('gives every beat time to be seen', () => {
      for (const ms of Object.values(togetherBeats(FIGHT_TIMING))) expect(ms).toBeGreaterThanOrEqual(100);
    });

    it('takes nothing at all under calm', () => {
      const calm = strikePlan({ calm: true });
      expect(calm.together).toBe(0);
      for (const ms of Object.values(togetherBeats(calm))) expect(ms).toBe(0);
      expect(togetherRoundLength(calm)).toBe(0);
    });

    it('keeps a whole round that plays it under the ceiling', () => {
      expect(togetherRoundLength(strikePlan({ calm: false }))).toBeLessThan(ROUND_CEILING_MS);
    });
  });

  it('holds every beat long enough to be seen', () => {
    for (const value of Object.values(FIGHT_TIMING)) expect(value).toBeGreaterThanOrEqual(100);
  });
});
