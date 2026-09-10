import { describe, expect, it } from 'vitest';
import {
  STARTER_FIXED,
  STARTER_ROTATION_POOL,
  rotatingPairFor,
  starterPlanFor,
} from './starterPlan';
import { DIFFICULTY_WEIGHT } from './types';

describe('STARTER_FIXED', () => {
  it('is the six that never change', () => {
    expect(STARTER_FIXED).toHaveLength(6);
  });

  it('gives every task a title and a real difficulty', () => {
    for (const task of STARTER_FIXED) {
      expect(task.title.trim().length).toBeGreaterThan(0);
      expect(DIFFICULTY_WEIGHT[task.difficulty]).toBeGreaterThan(0);
    }
  });

  it('repeats no title', () => {
    expect(new Set(STARTER_FIXED.map((t) => t.title)).size).toBe(STARTER_FIXED.length);
  });
});

describe('STARTER_ROTATION_POOL', () => {
  it('holds enough to rotate meaningfully', () => {
    expect(STARTER_ROTATION_POOL.length).toBeGreaterThanOrEqual(8);
  });

  it('repeats no title, and none collide with the fixed six', () => {
    expect(new Set(STARTER_ROTATION_POOL.map((t) => t.title)).size).toBe(
      STARTER_ROTATION_POOL.length,
    );
    const fixed = new Set(STARTER_FIXED.map((t) => t.title));
    for (const task of STARTER_ROTATION_POOL) expect(fixed.has(task.title)).toBe(false);
  });
});

describe('rotatingPairFor', () => {
  it('always returns two different tasks', () => {
    for (let week = 1; week <= STARTER_ROTATION_POOL.length; week += 1) {
      const [a, b] = rotatingPairFor(week);
      expect(a.title).not.toBe(b.title);
    }
  });

  it('agrees with itself for the same week', () => {
    expect(rotatingPairFor(23)).toEqual(rotatingPairFor(23));
  });

  it('changes as the week changes', () => {
    expect(rotatingPairFor(1)).not.toEqual(rotatingPairFor(2));
  });

  it('wraps rather than running off the end of the pool', () => {
    const n = STARTER_ROTATION_POOL.length;
    expect(rotatingPairFor(n + 1)).toEqual(rotatingPairFor(1));
  });

  it('is defined for a week number of zero, which ISO weeks never produce but arithmetic should still survive', () => {
    const [a, b] = rotatingPairFor(0);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
  });
});

describe('starterPlanFor', () => {
  it('seeds eight tasks: the fixed six plus a rotating pair', () => {
    expect(starterPlanFor('2026-09-25')).toHaveLength(8);
  });

  it('always leads with the fixed six, in order', () => {
    const plan = starterPlanFor('2026-01-05');
    expect(plan.slice(0, 6)).toEqual(STARTER_FIXED);
  });

  it('picks the same plan for two days in the same ISO week', () => {
    // 2026-09-21 (Monday) and 2026-09-25 (Friday) are the same ISO week.
    expect(starterPlanFor('2026-09-21')).toEqual(starterPlanFor('2026-09-25'));
  });

  it('picks a different rotating pair the following week', () => {
    const thisWeek = starterPlanFor('2026-09-25');
    const nextWeek = starterPlanFor('2026-10-02');
    expect(thisWeek.slice(6)).not.toEqual(nextWeek.slice(6));
  });
});
