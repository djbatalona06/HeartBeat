import { describe, expect, it } from 'vitest';
import { FIGHT_TIMING, roundLength, strikePlan } from './strikePlan';

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

  it('holds every beat long enough to be seen', () => {
    for (const value of Object.values(FIGHT_TIMING)) expect(value).toBeGreaterThanOrEqual(100);
  });
});
