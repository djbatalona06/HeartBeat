import { describe, expect, it } from 'vitest';
import { ChestAnimator, REVEAL_TIMING, revealPlan } from './animator';

/**
 * The arithmetic of a reveal, without a DOM.
 *
 * `ChestAnimator` itself is barely testable and barely worth testing — it hands
 * five keyframe lists to the browser. What is worth pinning is *when* each item
 * arrives and what happens when nothing is allowed to move, because those are
 * the two things a later edit can quietly get wrong.
 */

describe('the shape of a reveal', () => {
  it('opens the chest before any item arrives', () => {
    const plan = revealPlan(3);
    expect(plan.starts[0]).toBe(REVEAL_TIMING.shake + REVEAL_TIMING.burst);
  });

  it('staggers the items rather than landing them together', () => {
    const { starts } = revealPlan(3);
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBe(REVEAL_TIMING.stagger);
    expect(starts[2] - starts[1]).toBe(REVEAL_TIMING.stagger);
  });

  it('runs to the last item settling, not to the last one starting', () => {
    const plan = revealPlan(3);
    expect(plan.total).toBe(plan.starts[2] + REVEAL_TIMING.item);
  });

  /**
   * The whole thing is short on purpose: a chest is opened over and over, and
   * an animation somebody has already seen six times is a toll. If a later
   * edit makes the sequence long enough to be one, this is where it is caught.
   */
  it('is over inside a second and a half for three items', () => {
    expect(revealPlan(3).total).toBeLessThanOrEqual(1500);
  });

  it('scales with however many items a chest holds', () => {
    expect(revealPlan(1).starts).toHaveLength(1);
    expect(revealPlan(5).starts).toHaveLength(5);
    expect(revealPlan(5).total).toBeGreaterThan(revealPlan(3).total);
  });
});

describe('when nothing is allowed to move', () => {
  /** Calm mode and `prefers-reduced-motion` ask for no motion. A fast
   *  animation is still an animation, so every phase goes to zero. */
  it('collapses to nothing under calm rather than to something quick', () => {
    const plan = revealPlan(3, true);
    expect(plan.total).toBe(0);
    expect(plan.starts).toEqual([]);
    expect(plan.shake).toBe(0);
    expect(plan.burst).toBe(0);
  });

  it('has no duration with no items', () => {
    expect(revealPlan(0).total).toBe(0);
    expect(revealPlan(-2).total).toBe(0);
  });
});

describe('the animator itself', () => {
  /**
   * jsdom has no `Element.animate`, which is also the state of a page torn
   * down mid-open and of an engine without the Web Animations API. `run()`
   * resolving rather than throwing there is the whole contract: the prizes are
   * already in the DOM, and this only decides how they got there.
   */
  it('resolves without a DOM to animate', async () => {
    const animator = new ChestAnimator({ items: [null, null, null] });
    await expect(animator.run()).resolves.toBeUndefined();
  });

  it('reports no duration under calm, so a caller can skip the wait', () => {
    expect(new ChestAnimator({ items: [null, null, null] }, true).duration).toBe(0);
    expect(new ChestAnimator({ items: [null, null, null] }).duration).toBeGreaterThan(0);
  });

  it('can be cancelled before it has run, and before it has anything to stop', () => {
    const animator = new ChestAnimator({ items: [null] });
    expect(() => animator.cancel()).not.toThrow();
  });

  it('does nothing once cancelled', async () => {
    const animator = new ChestAnimator({ items: [null] });
    animator.cancel();
    await expect(animator.run()).resolves.toBeUndefined();
  });
});
