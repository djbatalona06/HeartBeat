import { describe, expect, it } from 'vitest';
import { PULL_ARM_PX, PULL_MAX_PX, pullDistance, pullState } from './pull';

describe('pull to refresh', () => {
  it('ignores a push upwards', () => {
    expect(pullDistance(-40)).toBe(0);
    expect(pullState(-40)).toBe('idle');
  });

  it('needs a real pull to arm, not a scroll that overshot', () => {
    expect(pullState(20)).toBe('pulling');
    expect(pullState(400)).toBe('armed');
  });

  it('damps the travel and never runs past the cap', () => {
    expect(pullDistance(100)).toBeLessThan(100);
    expect(pullDistance(10_000)).toBe(PULL_MAX_PX);
    expect(PULL_ARM_PX).toBeLessThan(PULL_MAX_PX);
  });

  it('only ever moves further as the finger does', () => {
    let last = 0;
    for (let dy = 0; dy < 600; dy += 7) {
      expect(pullDistance(dy)).toBeGreaterThanOrEqual(last);
      last = pullDistance(dy);
    }
  });
});
