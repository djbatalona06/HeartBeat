import { describe, expect, it } from 'vitest';
import {
  HOP_PX, SPRITE_DEPTH_CEILING, SPRITE_DEPTH_FLOOR, depthForRow, hopFor, liftAt,
} from './walk';

describe('walking up and down', () => {
  it('draws a lower row in front of a higher one', () => {
    expect(depthForRow(4, 7)).toBeGreaterThan(depthForRow(3, 7));
  });

  it('keeps every row inside the sprite band, under the effects', () => {
    for (let row = -1; row <= 8; row += 1) {
      const depth = depthForRow(row, 7);
      expect(depth).toBeGreaterThanOrEqual(SPRITE_DEPTH_FLOOR);
      expect(depth).toBeLessThan(SPRITE_DEPTH_CEILING);
    }
  });

  it('hops only on a vertical step, and never under calm', () => {
    expect(hopFor({ dy: -1, calm: false })).toBe(HOP_PX);
    expect(hopFor({ dy: 1, calm: false })).toBe(HOP_PX);
    expect(hopFor({ dy: 0, calm: false })).toBe(0);
    expect(hopFor({ dy: -1, calm: true })).toBe(0);
  });

  it('starts and lands on the ground, highest halfway', () => {
    expect(liftAt(0, HOP_PX)).toBe(0);
    expect(liftAt(1, HOP_PX)).toBeCloseTo(0);
    expect(liftAt(0.5, HOP_PX)).toBeCloseTo(HOP_PX);
  });
});
