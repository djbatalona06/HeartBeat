import { describe, expect, it } from 'vitest';
import {
  STACK_CAP, STACK_FALLOFF, TIERS, TIER_NAMES, TIER_PASSIVES, TIER_STAT_LEVELS,
  bandPosition, compareTiers, normalizeTier, passiveFor, stackPassives, statLevelFor,
  tierRank, tiersAtOrAbove, type Tier,
} from './tiers';

describe('the ladder', () => {
  it('runs common to mythic, and every rung is named', () => {
    expect(TIERS).toEqual(['common', 'rare', 'epic', 'legendary', 'mythic']);
    for (const tier of TIERS) expect(TIER_NAMES[tier]).toBeTruthy();
  });

  it('ranks ascending, so a sort puts the best last', () => {
    const shuffled: Tier[] = ['mythic', 'common', 'legendary', 'rare', 'epic'];
    expect([...shuffled].sort(compareTiers)).toEqual([...TIERS]);
    expect(tierRank('common')).toBeLessThan(tierRank('mythic'));
  });

  it('reads the retired token as legendary rather than as nothing', () => {
    expect(normalizeTier('godly')).toBe('legendary');
    expect(normalizeTier('mythic')).toBe('mythic');
    expect(normalizeTier(undefined)).toBe('common');
    expect(normalizeTier('whatever')).toBe('common');
  });

  it('cuts the ladder at a floor', () => {
    expect(tiersAtOrAbove('epic')).toEqual(['epic', 'legendary', 'mythic']);
    expect(tiersAtOrAbove('common')).toEqual([...TIERS]);
    expect(tiersAtOrAbove('mythic')).toEqual(['mythic']);
  });
});

describe('stat levels', () => {
  it('matches the table', () => {
    expect(TIER_STAT_LEVELS).toEqual({
      common: { min: 1, max: 3 },
      rare: { min: 4, max: 10 },
      epic: { min: 10, max: 20 },
      legendary: { min: 20, max: 30 },
      mythic: { min: 30, max: 50 },
    });
  });

  it('never rolls outside its own band', () => {
    for (const tier of TIERS) {
      const band = TIER_STAT_LEVELS[tier];
      for (let roll = 0; roll < 1; roll += 0.017) {
        const level = statLevelFor(tier, roll);
        expect(level).toBeGreaterThanOrEqual(band.min);
        expect(level).toBeLessThanOrEqual(band.max);
      }
      expect(statLevelFor(tier, 0)).toBe(band.min);
      expect(statLevelFor(tier, 0.9999999)).toBe(band.max);
    }
  });

  it('clamps a roll that has no business being out of range', () => {
    expect(statLevelFor('rare', -3)).toBe(4);
    expect(statLevelFor('rare', 7)).toBe(10);
  });

  it('climbs with the roll', () => {
    expect(statLevelFor('mythic', 0.1)).toBeLessThan(statLevelFor('mythic', 0.9));
  });
});

describe('passives', () => {
  it('gives common none, and every other tier some', () => {
    expect(passiveFor('common', 1)).toBe(0);
    expect(passiveFor('common', 3)).toBe(0);
    for (const tier of TIERS.filter((t) => t !== 'common')) {
      expect(passiveFor(tier, TIER_STAT_LEVELS[tier].min)).toBeGreaterThan(0);
    }
  });

  it('stays inside its own band, at both ends', () => {
    for (const tier of TIERS) {
      const stats = TIER_STAT_LEVELS[tier];
      const band = TIER_PASSIVES[tier];
      expect(passiveFor(tier, stats.min)).toBeCloseTo(band.min, 5);
      expect(passiveFor(tier, stats.max)).toBeCloseTo(band.max, 5);
    }
  });

  it('never overlaps the tier below it', () => {
    for (let i = 1; i < TIERS.length; i += 1) {
      const below = TIER_PASSIVES[TIERS[i - 1]];
      const here = TIER_PASSIVES[TIERS[i]];
      expect(here.min).toBeGreaterThan(below.max);
    }
  });

  it('rises with the stat level inside a tier', () => {
    expect(passiveFor('epic', 10)).toBeLessThan(passiveFor('epic', 20));
    expect(passiveFor('mythic', 30)).toBeLessThan(passiveFor('mythic', 50));
  });

  it('rounds to the decimal the table is written in', () => {
    for (const tier of TIERS) {
      for (let level = TIER_STAT_LEVELS[tier].min; level <= TIER_STAT_LEVELS[tier].max; level += 1) {
        const percent = passiveFor(tier, level);
        expect(Math.round(percent * 10)).toBe(percent * 10);
      }
    }
  });

  it('places a stat level in its band', () => {
    expect(bandPosition('epic', 10)).toBe(0);
    expect(bandPosition('epic', 15)).toBeCloseTo(0.5, 5);
    expect(bandPosition('epic', 20)).toBe(1);
    expect(bandPosition('epic', 99)).toBe(1);
  });
});

describe('stacking', () => {
  it('is worth nothing with nothing in it', () => {
    expect(stackPassives([])).toBe(0);
    expect(stackPassives([0, 0])).toBe(0);
  });

  it('passes a single passive straight through', () => {
    expect(stackPassives([5])).toBeCloseTo(0.05, 6);
  });

  it('discounts each further copy', () => {
    expect(stackPassives([10, 10])).toBeCloseTo(0.1 + 0.1 * STACK_FALLOFF, 6);
    const one = stackPassives([10]);
    const two = stackPassives([10, 10]);
    const three = stackPassives([10, 10, 10]);
    expect(two - one).toBeGreaterThan(three - two);
  });

  it('does not depend on the order things were equipped in', () => {
    expect(stackPassives([2, 9, 5])).toBeCloseTo(stackPassives([9, 5, 2]), 10);
    expect(stackPassives([5, 2, 9])).toBeCloseTo(stackPassives([9, 5, 2]), 10);
  });

  it('caps, and a full mythic set is what the cap is for', () => {
    const fullMythic = new Array(7).fill(10);
    expect(stackPassives(fullMythic)).toBe(STACK_CAP);
    expect(stackPassives([100, 100, 100])).toBe(STACK_CAP);
  });

  it('leaves a realistic set below the cap, so the cap is not the normal case', () => {
    // Two epics and three rares — a couple some months in.
    expect(stackPassives([5, 4, 2.5, 2, 1])).toBeLessThan(STACK_CAP);
  });
});
