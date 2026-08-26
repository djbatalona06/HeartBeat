import { describe, expect, it } from 'vitest';
import { xpForLevel } from '../xp';
import {
  applyPayout,
  baseStats,
  canSpend,
  levelOf,
  maxEnergy,
  maxMp,
  sheetFor,
  spend,
  statsFor,
} from './avatar';
import { STAGES, stageForLevel } from './stage';
import { newAvatar, type Avatar, type Payout, type StatKey } from './types';

const AT = 1_700_000_000_000;
const STAT_KEYS: StatKey[] = ['strength', 'insight', 'heart', 'luck'];

function avatar(over: Partial<Avatar> = {}): Avatar {
  return { ...newAvatar('m1', 'c1', AT), ...over };
}

describe('no classes', () => {
  /**
   * Habitica's classes are good design for a party of six, where the fun is
   * that the healer cannot tank. For a party of two they mean one person's
   * build can lock the other out of a boss, and there is nobody else to call.
   */
  it('raises all four stats together, at every level', () => {
    for (let level = 1; level <= 30; level += 1) {
      const stats = baseStats(level);
      const values = STAT_KEYS.map((k) => stats[k]);
      expect(new Set(values).size, `level ${level}`).toBe(1);
    }
  });

  it('gives every level the same weight to every stat', () => {
    for (let level = 1; level < 30; level += 1) {
      for (const key of STAT_KEYS) {
        expect(baseStats(level + 1)[key] - baseStats(level)[key]).toBe(1);
      }
    }
  });

  it('adds a gear bonus on top without disturbing the others', () => {
    const stats = statsFor(5, { strength: 4 });
    expect(stats.strength).toBe(baseStats(5).strength + 4);
    expect(stats.insight).toBe(baseStats(5).insight);
  });
});

describe('derived level', () => {
  /**
   * A stored level is a second copy of the XP that can disagree with it, and
   * the one that disagrees is always the one on screen. So the avatar row has
   * no level field at all — this test would not compile if it grew one.
   */
  it('is not a field on the stored row', () => {
    expect(Object.keys(avatar())).not.toContain('level');
    expect(Object.keys(avatar())).not.toContain('stats');
  });

  it('reads straight off the existing XP curve', () => {
    for (const level of [1, 2, 5, 9, 15]) {
      expect(levelOf(avatar({ xp: xpForLevel(level) }))).toBe(level);
    }
  });

  it('never disagrees with the XP it came from', () => {
    for (let xp = 0; xp < 4000; xp += 37) {
      const level = levelOf(avatar({ xp }));
      expect(xp).toBeGreaterThanOrEqual(xpForLevel(level));
      expect(xp).toBeLessThan(xpForLevel(level + 1));
    }
  });
});

describe('pools', () => {
  it('grows the MP ceiling with insight and the energy ceiling with heart', () => {
    expect(maxMp(statsFor(10))).toBeGreaterThan(maxMp(statsFor(1)));
    const stage = STAGES[0];
    expect(maxEnergy(stage, statsFor(10))).toBeGreaterThan(maxEnergy(stage, statsFor(1)));
  });
});

describe('applyPayout', () => {
  const payout: Payout = { xp: 12, coins: 5, energy: 8, mp: 3 };

  it('credits every pool', () => {
    const after = applyPayout(avatar(), payout, AT + 1);
    expect(after).toMatchObject({ xp: 12, coins: 5, energy: 8, mp: 3, updatedAt: AT + 1 });
  });

  it('fills energy and MP to the ceiling and stops', () => {
    const sheet = sheetFor(avatar());
    const after = applyPayout(
      avatar({ energy: sheet.maxEnergy, mp: sheet.maxMp }),
      { xp: 0, coins: 0, energy: 999, mp: 999 },
      AT,
    );
    expect(after.energy).toBe(sheet.maxEnergy);
    expect(after.mp).toBe(sheet.maxMp);
  });

  it('lets a payout that levels you up also fill the larger bar it unlocked', () => {
    const brink = avatar({ xp: xpForLevel(3) - 1 });
    const before = sheetFor(brink);
    const after = applyPayout(brink, { xp: 500, coins: 0, energy: 999, mp: 0 }, AT);
    expect(levelOf(after)).toBeGreaterThan(before.level);
    expect(after.energy).toBeGreaterThan(before.maxEnergy);
  });

  /** A payout has no negative branch. That is the daily-life half of the ruling. */
  it('cannot be used to subtract', () => {
    const before = avatar({ xp: 100, coins: 10, energy: 20, mp: 5 });
    const after = applyPayout(before, { xp: -50, coins: -5, energy: -10, mp: -5 }, AT);
    expect(after.xp).toBe(100);
    expect(after.coins).toBe(10);
    expect(after.energy).toBe(20);
    expect(after.mp).toBe(5);
  });

  it('leaves the original untouched', () => {
    const before = avatar();
    applyPayout(before, payout, AT);
    expect(before.xp).toBe(0);
  });
});

describe('spend', () => {
  it('debits what was asked for', () => {
    const after = spend(avatar({ energy: 30, mp: 10, coins: 40 }), { energy: 25, coins: 10 }, AT);
    expect(after).toMatchObject({ energy: 5, mp: 10, coins: 30 });
  });

  it('returns null rather than a partially-paid avatar', () => {
    const before = avatar({ energy: 5, coins: 100 });
    expect(canSpend(before, { energy: 25 })).toBe(false);
    expect(spend(before, { energy: 25, coins: 10 }, AT)).toBeNull();
  });
});

describe('sheetFor', () => {
  it('reports the stage the level has reached', () => {
    expect(sheetFor(avatar({ xp: 0 })).stage.id).toBe('egg');
    const grown = avatar({ xp: xpForLevel(21) });
    expect(sheetFor(grown).stage).toEqual(stageForLevel(21));
  });

  it('never shows more in a bar than the bar holds', () => {
    const sheet = sheetFor(avatar({ energy: 10_000, mp: 10_000 }));
    expect(sheet.energy).toBe(sheet.maxEnergy);
    expect(sheet.mp).toBe(sheet.maxMp);
  });
});
