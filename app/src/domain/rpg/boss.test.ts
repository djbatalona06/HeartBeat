import { describe, expect, it } from 'vitest';
import {
  BASE_DMG,
  BASE_HP,
  MAX_VICTORY_BONUS,
  MIN_VICTORY_BONUS,
  TIER_STEP,
  bossDamage,
  bossMaxHp,
  canStart,
  hitsToClear,
  hpFraction,
  nextTier,
  plainHit,
  resolveBlow,
  victoryDropBonus,
  waitingOn,
} from './boss';
import { statsFor } from './avatar';
import { skillById } from './skills';
import { petKindById } from './pets';

describe('tier escalation', () => {
  it('starts at exactly the base numbers', () => {
    expect(bossMaxHp(1)).toBe(BASE_HP);
    expect(bossDamage(1)).toBe(BASE_DMG);
  });

  /** The exact 1.25 step, pinned the way domain/xp.ts pins the levelling curve. */
  it('is 25% more of everything per tier, and never another number', () => {
    expect(TIER_STEP).toBe(1.25);
    for (let tier = 1; tier <= 12; tier += 1) {
      expect(bossMaxHp(tier)).toBe(Math.round(BASE_HP * TIER_STEP ** (tier - 1)));
      expect(bossDamage(tier)).toBe(Math.round(BASE_DMG * TIER_STEP ** (tier - 1)));
    }
  });

  it('pins the first five tiers to their exact values', () => {
    expect([1, 2, 3, 4, 5].map(bossMaxHp)).toEqual([600, 750, 938, 1172, 1465]);
    expect([1, 2, 3, 4, 5].map(bossDamage)).toEqual([18, 23, 28, 35, 44]);
  });

  it('is monotonic in HP and in damage', () => {
    for (let tier = 1; tier < 30; tier += 1) {
      expect(bossMaxHp(tier + 1)).toBeGreaterThan(bossMaxHp(tier));
      expect(bossDamage(tier + 1)).toBeGreaterThan(bossDamage(tier));
    }
  });

  it('treats a nonsense tier as the first one rather than throwing', () => {
    expect(bossMaxHp(0)).toBe(BASE_HP);
    expect(bossMaxHp(-4)).toBe(BASE_HP);
    expect(bossMaxHp(2.7)).toBe(bossMaxHp(2));
  });
});

describe('nextTier', () => {
  /** Escalation on victory only. Losing means the fight is still there — it
      does not mean the fight grew while you were down. */
  it('climbs on a win and re-runs the same tier on a defeat', () => {
    expect(nextTier(3, true)).toBe(4);
    expect(nextTier(3, false)).toBe(3);
    expect(nextTier(1, false)).toBe(1);
  });
});

describe('the victory drop bonus', () => {
  it('stays inside the 20–30% band at every tier', () => {
    for (let tier = 1; tier <= 60; tier += 1) {
      expect(victoryDropBonus(tier), `tier ${tier}`).toBeGreaterThanOrEqual(MIN_VICTORY_BONUS);
      expect(victoryDropBonus(tier), `tier ${tier}`).toBeLessThanOrEqual(MAX_VICTORY_BONUS);
    }
  });

  it('starts at 20%, climbs with the tier, and caps at 30%', () => {
    expect(victoryDropBonus(1)).toBeCloseTo(0.2, 10);
    expect(victoryDropBonus(2)).toBeCloseTo(0.22, 10);
    expect(victoryDropBonus(6)).toBeCloseTo(0.3, 10);
    expect(victoryDropBonus(99)).toBeCloseTo(0.3, 10);
  });

  it('never falls as the tier climbs', () => {
    for (let tier = 1; tier < 40; tier += 1) {
      expect(victoryDropBonus(tier + 1)).toBeGreaterThanOrEqual(victoryDropBonus(tier));
    }
  });
});

describe('a blow', () => {
  it('is the plain hit when no skill is attached', () => {
    const stats = statsFor(10);
    expect(resolveBlow(stats)).toEqual({
      damage: plainHit(stats), shield: 0, heal: 0, energy: 0,
    });
  });

  it('grows with strength and with nothing else', () => {
    expect(plainHit(statsFor(20))).toBeGreaterThan(plainHit(statsFor(2)));
    expect(plainHit({ strength: 5, insight: 99, heart: 99, luck: 99 }))
      .toBe(plainHit({ strength: 5, insight: 0, heart: 0, luck: 0 }));
  });

  it('composes your skill with your companion\'s', () => {
    const stats = statsFor(12);
    const mine = skillById('ember-strike')!.effect;
    const theirs = petKindById('cat-godly')!.skill.effect;
    const blow = resolveBlow(stats, [mine, theirs]);

    expect(blow.damage).toBe(Math.round(plainHit(stats) * mine.damage! * theirs.damage!));
    expect(blow.shield).toBe(theirs.shield);
    expect(blow.heal).toBe(theirs.heal);
  });

  it('adds the flat effects rather than taking the larger', () => {
    const blow = resolveBlow(statsFor(5), [{ shield: 10, heal: 4 }, { shield: 6, energy: 3 }]);
    expect(blow.shield).toBe(16);
    expect(blow.heal).toBe(4);
    expect(blow.energy).toBe(3);
  });

  it('cannot be negative even if handed nonsense stats', () => {
    expect(plainHit({ strength: -50, insight: 0, heart: 0, luck: 0 })).toBeGreaterThan(0);
  });
});

describe('the fight as the screen sees it', () => {
  it('reads the bar as a fraction, clamped both ways', () => {
    expect(hpFraction({ hp: 300, maxHp: 600 })).toBe(0.5);
    expect(hpFraction({ hp: -20, maxHp: 600 })).toBe(0);
    expect(hpFraction({ hp: 900, maxHp: 600 })).toBe(1);
    expect(hpFraction({ hp: 5, maxHp: 0 })).toBe(0);
  });

  /** One person cannot drag the other into a fight they would both wear. */
  it('will not start until both have said ready', () => {
    expect(canStart({ state: 'gathering', readyA: true, readyB: true })).toBe(true);
    expect(canStart({ state: 'gathering', readyA: true, readyB: false })).toBe(false);
    expect(canStart({ state: 'gathering', readyA: false, readyB: false })).toBe(false);
  });

  it('does not restart a fight that is already running or finished', () => {
    expect(canStart({ state: 'fighting', readyA: true, readyB: true })).toBe(false);
    expect(canStart({ state: 'won', readyA: true, readyB: true })).toBe(false);
  });

  it('says who it is waiting on', () => {
    expect(waitingOn({ state: 'gathering', readyA: false, readyB: false })).toMatch(/Neither/);
    expect(waitingOn({ state: 'gathering', readyA: true, readyB: false })).toMatch(/other half/);
    expect(waitingOn({ state: 'gathering', readyA: true, readyB: true })).toBeNull();
    expect(waitingOn({ state: 'fighting', readyA: true, readyB: true })).toBeNull();
  });

  it('reports a tier as a number of plain hits, so it can be judged in advance', () => {
    const stats = statsFor(10);
    expect(hitsToClear(1, stats)).toBe(Math.ceil(bossMaxHp(1) / plainHit(stats)));
    expect(hitsToClear(5, stats)).toBeGreaterThan(hitsToClear(1, stats));
  });
});
