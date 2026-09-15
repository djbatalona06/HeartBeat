import { describe, expect, it } from 'vitest';
import {
  BARE_TETHER, MILESTONES, MILESTONE_KIND_NAMES, milestoneStats, milestonesAt, milestonesUpTo,
  nextMilestone, skillUnlocked, tetherFor, totalMilestoneStatPoints, unlockedPlots,
  unlockedTethers,
} from './milestones';
import { MAX_LEVEL } from '../xp';
import { PLOTS } from './plots';
import { RAID_STATS } from './raidStats';

describe('the ladder', () => {
  it('is in level order, which every lookup below assumes', () => {
    for (let i = 1; i < MILESTONES.length; i += 1) {
      expect(MILESTONES[i].level, MILESTONES[i].name)
        .toBeGreaterThanOrEqual(MILESTONES[i - 1].level);
    }
  });

  it('stays inside the curve it is a ladder for', () => {
    for (const entry of MILESTONES) {
      expect(entry.level, entry.name).toBeGreaterThan(1);
      expect(entry.level, entry.name).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });

  it('finishes at the top, so the last level is worth reaching', () => {
    expect(MILESTONES[MILESTONES.length - 1].level).toBe(MAX_LEVEL);
  });

  /** A level-up that grants nothing is a notification. */
  it('makes every entry open something or add a number', () => {
    for (const entry of MILESTONES) {
      const grants = entry.plot ?? entry.stat ?? entry.tether ?? entry.skill;
      expect(grants, `${entry.level}: ${entry.name}`).toBeDefined();
      expect(entry.blurb.length, entry.name).toBeGreaterThan(20);
      expect(MILESTONE_KIND_NAMES[entry.kind]).toBeTruthy();
    }
  });

  it('gives every entry a name of its own', () => {
    expect(new Set(MILESTONES.map((m) => m.name)).size).toBe(MILESTONES.length);
  });

  /**
   * The bands from `xp.ts`, restated as rewards. Early levels have to keep
   * handing you something; the top of the curve deliberately does not, because
   * a reward every level for two years is a treadmill.
   */
  it('front-loads, so the fortnight that decides everything is the busy one', () => {
    const days = MILESTONES.filter((m) => m.level <= 10).length;
    const longHaul = MILESTONES.filter((m) => m.level > 30).length;
    expect(days).toBeGreaterThan(longHaul);
  });
});

describe('plots', () => {
  it('opens every plot the garden actually has, and no others', () => {
    expect(unlockedPlots(MAX_LEVEL).sort()).toEqual(PLOTS.map((p) => p.id).sort());
  });

  it('opens none at level one, and the first one early', () => {
    expect(unlockedPlots(1)).toEqual([]);
    expect(unlockedPlots(2)).toHaveLength(1);
  });

  it('only ever opens more ground', () => {
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      expect(unlockedPlots(level).length, `level ${level}`)
        .toBeGreaterThanOrEqual(unlockedPlots(level - 1).length);
    }
  });

  it('names no plot the garden has never heard of', () => {
    const known = new Set(PLOTS.map((p) => p.id));
    for (const id of unlockedPlots(MAX_LEVEL)) expect(known.has(id), id).toBe(true);
  });
});

describe('tethers', () => {
  it('starts bare, and nobody has to earn that', () => {
    expect(tetherFor(1)).toBe(BARE_TETHER);
    expect(unlockedTethers(1)).toEqual([]);
  });

  it('wears the most recent one earned', () => {
    const earned = unlockedTethers(MAX_LEVEL);
    expect(earned.length).toBeGreaterThan(2);
    expect(tetherFor(MAX_LEVEL)).toBe(earned[earned.length - 1]);
  });

  it('never takes one back', () => {
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      const before = unlockedTethers(level - 1);
      const after = unlockedTethers(level);
      expect(after.slice(0, before.length)).toEqual(before);
    }
  });

  it('gives every tether its own id', () => {
    const all = unlockedTethers(MAX_LEVEL);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('the companion\'s kit', () => {
  it('opens the passive before the support skill', () => {
    expect(skillUnlocked(1, 'passive')).toBe(false);
    expect(skillUnlocked(3, 'passive')).toBe(true);
    expect(skillUnlocked(3, 'support')).toBe(false);
    expect(skillUnlocked(6, 'support')).toBe(true);
  });

  it('never closes again', () => {
    for (let level = 6; level <= MAX_LEVEL; level += 1) {
      expect(skillUnlocked(level, 'support'), `level ${level}`).toBe(true);
    }
  });
});

describe('stat grants', () => {
  it('gives nothing before the first one is earned', () => {
    expect(milestoneStats(1)).toEqual({});
    expect(milestoneStats(9)).toEqual({});
  });

  it('adds up, and only ever upward', () => {
    let last = 0;
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      const total = Object.values(milestoneStats(level)).reduce((a, b) => a + b, 0);
      expect(total, `level ${level}`).toBeGreaterThanOrEqual(last);
      last = total;
    }
  });

  it('names only stats that exist', () => {
    for (const key of Object.keys(milestoneStats(MAX_LEVEL))) {
      expect(RAID_STATS).toContain(key);
    }
  });

  /**
   * Small on purpose. Levelling is the one thing both partners contribute to,
   * and a curve that out-scaled gear would make the wardrobe pointless — so the
   * whole climb is worth less than one mythic item's stat level.
   */
  it('stays a floor rather than a replacement for owning things', () => {
    expect(totalMilestoneStatPoints()).toBeGreaterThan(20);
    expect(totalMilestoneStatPoints()).toBeLessThan(50);
  });

  it('spreads across several stats rather than stacking one', () => {
    expect(Object.keys(milestoneStats(MAX_LEVEL)).length).toBeGreaterThanOrEqual(5);
  });
});

describe('looking ahead and behind', () => {
  it('lists what a level handed over', () => {
    expect(milestonesAt(2)).toHaveLength(1);
    expect(milestonesAt(7)).toEqual([]);
  });

  it('points at the next thing, and at nothing past the top', () => {
    expect(nextMilestone(1)!.level).toBe(2);
    expect(nextMilestone(2)!.level).toBeGreaterThan(2);
    expect(nextMilestone(MAX_LEVEL)).toBeNull();
    expect(nextMilestone(MAX_LEVEL + 10)).toBeNull();
  });

  it('counts everything earned so far and nothing that is not', () => {
    expect(milestonesUpTo(1)).toEqual([]);
    expect(milestonesUpTo(MAX_LEVEL)).toHaveLength(MILESTONES.length);
    for (const entry of milestonesUpTo(12)) expect(entry.level).toBeLessThanOrEqual(12);
  });
});
