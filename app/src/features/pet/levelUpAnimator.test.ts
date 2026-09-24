import { describe, expect, it } from 'vitest';
import { LevelUpAnimator, levelUpPlan } from './levelUpAnimator';

/**
 * Like `chest/animator.test.ts`: the arithmetic and the no-DOM path. The
 * keyframes themselves are handed to the browser and judged by eye.
 */

describe('the shape of a level-up', () => {
  /** Fifty rungs means it is seen often. A nod, not a cutscene. */
  it('is over inside a second', () => {
    expect(levelUpPlan({ calm: false, big: false }).total).toBeLessThan(1000);
  });

  it('is bigger at a plot level, and still short', () => {
    const big = levelUpPlan({ calm: false, big: true });
    expect(big.total).toBeGreaterThan(levelUpPlan({ calm: false, big: false }).total);
    expect(big.total).toBeLessThan(1600);
    expect(big.hops).toBeGreaterThan(1);
  });

  it('collapses to nothing under calm, big or not', () => {
    for (const big of [false, true]) {
      const plan = levelUpPlan({ calm: true, big });
      expect(plan.total).toBe(0);
      expect(plan.hops).toBe(0);
      expect(plan.glow).toBe(0);
      expect(plan.fill).toBe(0);
    }
  });
});

describe('the animator itself', () => {
  it('resolves without a DOM to animate', async () => {
    const animator = new LevelUpAnimator({}, levelUpPlan({ calm: false, big: true }));
    await expect(animator.run()).resolves.toBeUndefined();
  });

  it('can be cancelled before it runs, and then does nothing', async () => {
    const animator = new LevelUpAnimator({}, levelUpPlan({ calm: false, big: false }));
    expect(() => animator.cancel()).not.toThrow();
    await expect(animator.run()).resolves.toBeUndefined();
  });
});
