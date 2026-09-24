import { describe, expect, it } from 'vitest';
import { DIRECTIONS, HOLD_REPEAT_MS } from './dpad';

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
