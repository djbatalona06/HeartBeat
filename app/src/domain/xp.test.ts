import { describe, expect, it } from 'vitest';
import {
  LEVEL_BANDS, MAX_LEVEL, awardFor, costOfLevel, isMaxLevel, levelForXp, levelProgress, xpForLevel,
} from './xp';
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

  it('keeps costing more, all the way up, in every band', () => {
    for (let level = 3; level <= MAX_LEVEL; level += 1) {
      expect(costOfLevel(level), `level ${level}`).toBeGreaterThan(costOfLevel(level - 1));
    }
  });

  /**
   * The promise the bands were added under: levels 2-10 are exactly the curve
   * that shipped, so nobody's pet loses a level to this release. Recomputed
   * here from the original one-line formula rather than from a copied table.
   */
  it('leaves the shipped early curve alone', () => {
    let total = 0;
    for (let level = 2; level <= 10; level += 1) {
      total += Math.round(100 * 1.35 ** (level - 2));
      expect(xpForLevel(level), `level ${level}`).toBe(total);
    }
  });

  it('is never harder than the flat 1.35 curve it replaced', () => {
    let total = 0;
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      total += Math.round(100 * 1.35 ** (level - 2));
      expect(xpForLevel(level), `level ${level}`).toBeLessThanOrEqual(total);
    }
  });

  it('stops at the ceiling instead of climbing forever', () => {
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
    expect(xpForLevel(MAX_LEVEL + 9)).toBe(xpForLevel(MAX_LEVEL));
    expect(costOfLevel(MAX_LEVEL + 1)).toBe(0);
    expect(isMaxLevel(MAX_LEVEL)).toBe(true);
    expect(isMaxLevel(MAX_LEVEL - 1)).toBe(false);
  });

  it('shows a full bar at the ceiling rather than dividing by zero', () => {
    const p = levelProgress(xpForLevel(MAX_LEVEL) + 5000);
    expect(p.level).toBe(MAX_LEVEL);
    expect(p.fraction).toBe(1);
    expect(Number.isFinite(p.fraction)).toBe(true);
  });

  it('softens as it climbs, so no band is steeper than the one below it', () => {
    for (let i = 1; i < LEVEL_BANDS.length; i += 1) {
      expect(LEVEL_BANDS[i].growth).toBeLessThan(LEVEL_BANDS[i - 1].growth);
    }
    expect(LEVEL_BANDS[LEVEL_BANDS.length - 1].through).toBe(MAX_LEVEL);
  });

  /**
   * The table in the module header, asserted in days rather than in XP.
   *
   * This is the test that makes the curve arguable. A growth rate on its own
   * says nothing anybody can disagree with; "level 30 is eight months of two
   * people logging" is a claim, and changing a band tells you what it did to
   * the calendar. 300 XP a day is two people doing the five logs plus a fight.
   */
  it('lands each band where the header says it does', () => {
    const PER_DAY = 300;
    const days = (level: number) => Math.round(xpForLevel(level) / PER_DAY);

    expect(days(10)).toBeGreaterThanOrEqual(7);
    expect(days(10)).toBeLessThanOrEqual(21);      // a fortnight
    expect(days(20)).toBeGreaterThanOrEqual(60);
    expect(days(20)).toBeLessThanOrEqual(120);     // about three months
    expect(days(30)).toBeGreaterThanOrEqual(180);
    expect(days(30)).toBeLessThanOrEqual(330);     // about eight months
    expect(days(MAX_LEVEL)).toBeGreaterThanOrEqual(600);
    expect(days(MAX_LEVEL)).toBeLessThanOrEqual(1200); // a couple of years
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
