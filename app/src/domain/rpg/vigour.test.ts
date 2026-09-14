import { describe, expect, it } from 'vitest';
import {
  HP_PER_STREAK_DAY, MAX_STREAK_HP, MAX_VIGOUR, NO_VIGOUR, liftOf, statsWith, vigourOf,
} from './vigour';
import { RADIANCE_FLOOR, RADIANCE_FULL, type Vitals } from './vitals';
import { ZERO_STATS } from './avatar';
import { baseStats } from './avatar';
import type { StatKey } from './types';

const STAT_KEYS: StatKey[] = ['strength', 'insight', 'heart', 'luck'];

/** A Vitals with only the two fields vigour reads set to anything meaningful. */
function vitals(radiance: number, streakDays: number): Vitals {
  return {
    attributes: { vitality: 0, serenity: 0, bond: 0 },
    xp: 0,
    streak: { days: streakDays, shieldsSpent: 0, shieldsLeft: 0, loggedToday: false },
    radiance,
    stage: { id: 'egg', name: 'Egg', blurb: '', xp: 0, streak: 0, bothRecently: false },
    next: null,
    remaining: [],
    togetherDays: 0,
    bothRecently: false,
  };
}

describe('liftOf', () => {
  it('is zero at the radiance floor', () => {
    expect(liftOf(RADIANCE_FLOOR)).toBe(0);
  });

  it('is one at full radiance', () => {
    expect(liftOf(RADIANCE_FULL)).toBe(1);
  });

  it('never leaves [0, 1], even for a radiance outside the documented range', () => {
    for (const r of [-500, -1, 0, 39, 40, 70, 100, 101, 5000, Number.MAX_SAFE_INTEGER]) {
      const lift = liftOf(r);
      expect(lift).toBeGreaterThanOrEqual(0);
      expect(lift).toBeLessThanOrEqual(1);
    }
  });
});

describe('vigourOf', () => {
  // The rule the whole module exists to hold. If this ever fails, a bad week has
  // started costing somebody a fight.
  it('is never negative, at any radiance or streak', () => {
    for (const r of [-100, 0, RADIANCE_FLOOR, 55, 80, RADIANCE_FULL, 400]) {
      for (const days of [-5, 0, 1, 7, 30, 900]) {
        const v = vigourOf(vitals(r, days));
        expect(v.hpBonus).toBeGreaterThanOrEqual(0);
        for (const key of STAT_KEYS) expect(v.bonus[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives nothing at the floor with no streak, and says so without blame', () => {
    const v = vigourOf(vitals(RADIANCE_FLOOR, 0));
    expect(v.hpBonus).toBe(0);
    for (const key of STAT_KEYS) expect(v.bonus[key]).toBe(0);
    expect(v.plain).toBe(true);
    // Named as an absence. No "you", no "missed", no second person singled out.
    expect(v.note).not.toMatch(/miss|fail|lost|penal|should|your fault|partner/i);
  });

  it('caps the stat bonus at MAX_VIGOUR', () => {
    const v = vigourOf(vitals(RADIANCE_FULL, 0));
    for (const key of STAT_KEYS) expect(v.bonus[key]).toBe(MAX_VIGOUR);
  });

  it('lifts all four stats by the same amount — the no-classes rule', () => {
    for (const r of [RADIANCE_FLOOR, 60, 75, RADIANCE_FULL]) {
      const v = vigourOf(vitals(r, 3));
      const values = STAT_KEYS.map((key) => v.bonus[key]);
      expect(new Set(values).size).toBe(1);
    }
  });

  it('caps the HP bonus at MAX_STREAK_HP', () => {
    expect(vigourOf(vitals(RADIANCE_FULL, 10_000)).hpBonus).toBe(MAX_STREAK_HP);
  });

  it('pays HP_PER_STREAK_DAY per day until the cap', () => {
    expect(vigourOf(vitals(RADIANCE_FLOOR, 3)).hpBonus).toBe(3 * HP_PER_STREAK_DAY);
  });

  it('rises monotonically with radiance', () => {
    let last = -1;
    for (const r of [40, 50, 60, 70, 80, 90, 100]) {
      const step = vigourOf(vitals(r, 0)).bonus.strength;
      expect(step).toBeGreaterThanOrEqual(last);
      last = step;
    }
  });

  it('is plain only when both halves are nothing', () => {
    expect(vigourOf(vitals(RADIANCE_FLOOR, 0)).plain).toBe(true);
    expect(vigourOf(vitals(RADIANCE_FLOOR, 5)).plain).toBe(false);
    expect(vigourOf(vitals(RADIANCE_FULL, 0)).plain).toBe(false);
  });

  it('always produces a note', () => {
    for (const r of [RADIANCE_FLOOR, 60, RADIANCE_FULL]) {
      for (const days of [0, 4, 40]) {
        expect(vigourOf(vitals(r, days)).note.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('statsWith', () => {
  it('is the identity when there is no vigour', () => {
    expect(statsWith(baseStats(5), NO_VIGOUR)).toEqual(baseStats(5));
  });

  it('never returns a stat below what was walked in with', () => {
    for (const r of [-100, RADIANCE_FLOOR, 70, RADIANCE_FULL]) {
      const before = baseStats(1);
      const after = statsWith(before, vigourOf(vitals(r, 0)));
      for (const key of STAT_KEYS) expect(after[key]).toBeGreaterThanOrEqual(before[key]);
    }
  });

  it('adds the bonus on top', () => {
    const v = vigourOf(vitals(RADIANCE_FULL, 0));
    expect(statsWith(ZERO_STATS, v)).toEqual({
      strength: MAX_VIGOUR, insight: MAX_VIGOUR, heart: MAX_VIGOUR, luck: MAX_VIGOUR,
    });
  });
});

describe('NO_VIGOUR', () => {
  it('matches what a floored, streakless couple gets', () => {
    expect(vigourOf(vitals(RADIANCE_FLOOR, 0))).toEqual(NO_VIGOUR);
  });
});
