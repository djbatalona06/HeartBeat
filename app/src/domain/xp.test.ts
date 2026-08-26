import { describe, expect, it } from 'vitest';
import { awardFor, levelForXp, levelProgress, xpForLevel } from './xp';
import type { Quest } from './types';

describe('levelling', () => {
  it('starts at level 1 with no xp', () => {
    expect(levelForXp(0)).toBe(1);
    expect(xpForLevel(1)).toBe(0);
  });

  it('is monotonic: more xp never means a lower level', () => {
    let last = 1;
    for (let xp = 0; xp < 20000; xp += 37) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it('levels exactly at the threshold, not one xp late', () => {
    for (let level = 2; level <= 12; level += 1) {
      const at = xpForLevel(level);
      expect(levelForXp(at)).toBe(level);
      expect(levelForXp(at - 1)).toBe(level - 1);
    }
  });

  it('reports progress inside the current level', () => {
    const p = levelProgress(xpForLevel(3) + 10);
    expect(p.level).toBe(3);
    expect(p.into).toBe(10);
    expect(p.fraction).toBeGreaterThan(0);
    expect(p.fraction).toBeLessThan(1);
  });

  it('each level costs more than the one before', () => {
    for (let level = 2; level < 10; level += 1) {
      const thisCost = xpForLevel(level + 1) - xpForLevel(level);
      const prevCost = xpForLevel(level) - xpForLevel(level - 1);
      expect(thisCost).toBeGreaterThan(prevCost);
    }
  });
});

describe('quest awards', () => {
  const quest = (progress: number, target: number, xp: number): Quest => ({
    id: 'q', coupleId: 'c', templateId: 't', difficulty: 'easy',
    title: 'x', progress, target, xp, expiresAt: 0,
  });

  it('pays only for finished quests', () => {
    expect(awardFor([quest(3, 5, 50), quest(5, 5, 50)])).toBe(50);
  });

  it('counts overshoot as complete but does not pay twice', () => {
    expect(awardFor([quest(9, 5, 40)])).toBe(40);
  });

  it('pays nothing for an empty list', () => {
    expect(awardFor([])).toBe(0);
  });
});
