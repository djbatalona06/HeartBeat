import { describe, expect, it } from 'vitest';
import {
  STAGES,
  adventureCost,
  canAdventure,
  nextStage,
  nextStageLevel,
  stageById,
  stageForLevel,
} from './stage';

describe('the growth stages', () => {
  it('runs egg to guardian, in order', () => {
    expect(STAGES.map((s) => s.id)).toEqual([
      'egg', 'hatchling', 'fledgling', 'youngling', 'companion', 'guardian',
    ]);
  });

  it('starts at level 1 and never repeats a threshold', () => {
    expect(STAGES[0].minLevel).toBe(1);
    for (let i = 1; i < STAGES.length; i += 1) {
      expect(STAGES[i].minLevel).toBeGreaterThan(STAGES[i - 1].minLevel);
    }
  });

  /**
   * The two curves that make a grown companion feel capable rather than merely
   * bigger, and the pair Finch itself runs: an adventure costs more and takes
   * less time as the pet grows.
   */
  it('raises the energy cost at every stage', () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      expect(STAGES[i].energyCost).toBeGreaterThan(STAGES[i - 1].energyCost);
    }
  });

  it('shortens the adventure at every stage', () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      expect(STAGES[i].adventureHours).toBeLessThan(STAGES[i - 1].adventureHours);
    }
  });

  it('raises the energy ceiling alongside the cost, so growth is not a trap', () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      expect(STAGES[i].baseMaxEnergy).toBeGreaterThan(STAGES[i - 1].baseMaxEnergy);
      // The ceiling has to stay comfortably above a single adventure, or a
      // grown pet could never be sent out at all.
      expect(STAGES[i].baseMaxEnergy).toBeGreaterThan(STAGES[i].energyCost * 2);
    }
  });

  it('gives every stage a line of its own', () => {
    const blurbs = STAGES.map((s) => s.blurb);
    expect(new Set(blurbs).size).toBe(STAGES.length);
  });
});

describe('stageForLevel', () => {
  it('holds a stage until the next threshold is reached', () => {
    expect(stageForLevel(1).id).toBe('egg');
    expect(stageForLevel(2).id).toBe('egg');
    expect(stageForLevel(3).id).toBe('hatchling');
    expect(stageForLevel(5).id).toBe('hatchling');
    expect(stageForLevel(6).id).toBe('fledgling');
  });

  it('never regresses as the level climbs', () => {
    let index = 0;
    for (let level = 1; level <= 60; level += 1) {
      const next = STAGES.indexOf(stageForLevel(level));
      expect(next).toBeGreaterThanOrEqual(index);
      index = next;
    }
  });

  it('clamps below level 1 and above the last stage', () => {
    expect(stageForLevel(0).id).toBe('egg');
    expect(stageForLevel(999).id).toBe('guardian');
  });

  it('looks a stage up by id', () => {
    expect(stageById('companion').minLevel).toBe(15);
  });
});

describe('the next stage', () => {
  it('names the level it arrives at', () => {
    expect(nextStageLevel(1)).toBe(3);
    expect(nextStage(1)?.id).toBe('hatchling');
  });

  it('is null once the last stage is reached', () => {
    expect(nextStageLevel(21)).toBeNull();
    expect(nextStage(50)).toBeNull();
  });
});

describe('adventureCost', () => {
  it('answers the question before you start, not after', () => {
    const cost = adventureCost(1, 3);
    expect(cost.energy).toBe(STAGES[0].energyCost);
    expect(cost.hours).toBe(STAGES[0].adventureHours);
    expect(cost.shortBy).toBe(2);
  });

  it('reports nothing outstanding once the energy is there', () => {
    expect(adventureCost(1, 99).shortBy).toBe(0);
    expect(canAdventure(1, 5)).toBe(true);
    expect(canAdventure(1, 4)).toBe(false);
  });
});
