import { describe, expect, it } from 'vitest';
import {
  ASCENDANT_LEVEL, AURA_POINTS, FRAME_POINTS, UNLOCKS, isUnlocked, nextGoals, type UnlockState,
} from './unlocks';
import { TOGETHER_TIERS } from './together';

const fresh: UnlockState = { togetherPoints: 0, petLevel: 1, elder: false };

describe('unlocks', () => {
  it('reads its thresholds off the together ladder', () => {
    expect(AURA_POINTS).toBe(TOGETHER_TIERS.find((t) => t.name === 'Rooted')!.at);
    expect(FRAME_POINTS).toBe(TOGETHER_TIERS.find((t) => t.name === 'Evergreen')!.at);
    expect([AURA_POINTS, FRAME_POINTS, ASCENDANT_LEVEL]).toEqual([1200, 2600, 21]);
  });

  it('shows a real number from the first day', () => {
    const [first] = nextGoals(fresh, 1);
    expect(first.check.need).toBeGreaterThan(0);
    expect(first.check.have).toBeGreaterThanOrEqual(0);
    expect(nextGoals(fresh)).toHaveLength(2);
  });

  it('keeps progress between 0 and 1, and full exactly when reached', () => {
    const states: UnlockState[] = [
      fresh,
      { togetherPoints: -50, petLevel: -3, elder: false },
      { togetherPoints: Number.NaN, petLevel: 99, elder: true },
      { togetherPoints: 99999, petLevel: 50, elder: true },
    ];
    for (const state of states) {
      for (const unlock of UNLOCKS) {
        const { progress, eligible } = unlock.check(state);
        expect(progress, unlock.id).toBeGreaterThanOrEqual(0);
        expect(progress, unlock.id).toBeLessThanOrEqual(1);
        expect(eligible, unlock.id).toBe(progress >= 1);
      }
    }
  });

  it('never goes backwards as any input grows', () => {
    for (const unlock of UNLOCKS) {
      let last = -1;
      for (let points = 0; points <= 3000; points += 50) {
        const now = unlock.check({ togetherPoints: points, petLevel: 10, elder: false }).progress;
        expect(now, `${unlock.id} at ${points} points`).toBeGreaterThanOrEqual(last);
        last = now;
      }
      last = -1;
      for (let level = 1; level <= 50; level += 1) {
        const now = unlock.check({ togetherPoints: 500, petLevel: level, elder: false }).progress;
        expect(now, `${unlock.id} at level ${level}`).toBeGreaterThanOrEqual(last);
        last = now;
      }
      const without = unlock.check({ togetherPoints: 500, petLevel: 30, elder: false }).progress;
      const withElder = unlock.check({ togetherPoints: 500, petLevel: 30, elder: true }).progress;
      expect(withElder, unlock.id).toBeGreaterThanOrEqual(without);
    }
  });

  it('asks Ascendant for Elder as well as the level', () => {
    expect(isUnlocked('ascendant', { togetherPoints: 0, petLevel: 30, elder: false })).toBe(false);
    expect(isUnlocked('ascendant', { togetherPoints: 0, petLevel: 20, elder: true })).toBe(false);
    expect(isUnlocked('ascendant', { togetherPoints: 0, petLevel: 21, elder: true })).toBe(true);
  });

  it('opens the aura at Rooted and the frame at Evergreen', () => {
    expect(isUnlocked('shared-aura', { ...fresh, togetherPoints: 1199 })).toBe(false);
    expect(isUnlocked('shared-aura', { ...fresh, togetherPoints: 1200 })).toBe(true);
    expect(isUnlocked('evergreen-frame', { ...fresh, togetherPoints: 2600 })).toBe(true);
  });

  it('shows nothing ahead once everything is reached', () => {
    expect(nextGoals({ togetherPoints: 5000, petLevel: 40, elder: true })).toEqual([]);
  });
});
