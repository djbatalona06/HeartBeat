import { describe, expect, it } from 'vitest';
import {
  BASE_DMG,
  BASE_HP,
  MAX_BLOW_FRACTION,
  TIER_STEP,
  bossDamage,
  bossMaxHp,
  bothReady,
  clampBlow,
  nextTier,
  readySlots,
} from './boss';

/**
 * These pin the same table of numbers as `app/src/domain/rpg/boss.test.ts`.
 * The duplication is deliberate — see the note at the top of `boss.ts` — and
 * these two tests are what keep the copy honest. If a tier's HP is changed on
 * one side only, one of the two suites fails.
 */
describe('tier escalation', () => {
  it('is 25% more of everything per tier', () => {
    expect(TIER_STEP).toBe(1.25);
    expect(bossMaxHp(1)).toBe(BASE_HP);
    expect(bossDamage(1)).toBe(BASE_DMG);
  });

  it('pins the first five tiers to their exact values', () => {
    expect([1, 2, 3, 4, 5].map(bossMaxHp)).toEqual([600, 750, 938, 1172, 1465]);
    expect([1, 2, 3, 4, 5].map(bossDamage)).toEqual([18, 23, 28, 35, 44]);
  });

  it('is monotonic', () => {
    for (let tier = 1; tier < 20; tier += 1) {
      expect(bossMaxHp(tier + 1)).toBeGreaterThan(bossMaxHp(tier));
    }
  });

  it('climbs on a win and re-runs the same tier on a defeat', () => {
    expect(nextTier(4, true)).toBe(5);
    expect(nextTier(4, false)).toBe(4);
  });

  it('treats a nonsense tier as the first one', () => {
    expect(bossMaxHp(0)).toBe(BASE_HP);
    expect(bossMaxHp(-9)).toBe(BASE_HP);
  });
});

describe('clampBlow', () => {
  /** Not because either of them would cheat: because a bug that sends NaN
      should cost a turn, not the whole fight. */
  it('refuses anything that is not a positive finite number', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, -5, 0, '40', null, undefined, {}]) {
      expect(clampBlow(bad, 600), String(bad)).toBe(0);
    }
  });

  it('caps a single blow at a quarter of the bar', () => {
    expect(clampBlow(1e9, 600)).toBe(600 * MAX_BLOW_FRACTION);
    expect(clampBlow(40, 600)).toBe(40);
  });

  it('floors a fractional blow rather than rounding it up', () => {
    expect(clampBlow(40.9, 600)).toBe(40);
  });

  it('always leaves at least one point of damage possible', () => {
    expect(clampBlow(50, 1)).toBe(1);
  });
});

describe('readiness', () => {
  const empty = { ready_a: null, ready_b: null };

  it('fills the first slot, then the second', () => {
    const first = readySlots(empty, 'her')!;
    expect(first).toEqual({ ready_a: 'her', ready_b: null });
    expect(bothReady(first)).toBe(false);

    const second = readySlots(first, 'him')!;
    expect(second).toEqual({ ready_a: 'her', ready_b: 'him' });
    expect(bothReady(second)).toBe(true);
  });

  /** A double tap is a no-op, not the second person. */
  it('will not let one member fill both slots', () => {
    const first = readySlots(empty, 'her')!;
    expect(readySlots(first, 'her')).toBeNull();
  });

  it('is a no-op once both have said it', () => {
    expect(readySlots({ ready_a: 'her', ready_b: 'him' }, 'her')).toBeNull();
    expect(readySlots({ ready_a: 'her', ready_b: 'him' }, 'someone-else')).toBeNull();
  });
});
