import { describe, expect, it } from 'vitest';
import { DIRECTIONS, HOLD_REPEAT_MS, walkPadShown } from './dpad';

describe('DIRECTIONS', () => {
  it('is one unit step per cardinal direction', () => {
    const vectors = DIRECTIONS.map((d) => `${d.dx},${d.dy}`).sort();
    expect(vectors).toEqual(['-1,0', '0,-1', '0,1', '1,0']);
  });

  it('gives every button its own name', () => {
    expect(new Set(DIRECTIONS.map((d) => d.label)).size).toBe(DIRECTIONS.length);
  });

  it('repeats slower than a step tweens, so a held button is never all busy', () => {
    expect(HOLD_REPEAT_MS).toBeGreaterThan(140);
  });
});

describe('walkPadShown', () => {
  const calm = { fighting: false, asking: false, engaging: false };

  it('shows while walking', () => {
    expect(walkPadShown(calm)).toBe(true);
  });

  it('clears the moment a foe is reached, before the fight has started', () => {
    expect(walkPadShown({ ...calm, engaging: true })).toBe(false);
  });

  it('stays clear while the boss prompt is open and while the fight runs', () => {
    expect(walkPadShown({ ...calm, asking: true, engaging: true })).toBe(false);
    expect(walkPadShown({ ...calm, fighting: true, engaging: true })).toBe(false);
  });
});
