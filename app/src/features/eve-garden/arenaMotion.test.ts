import { describe, expect, it } from 'vitest';
import { shouldAnimateArena } from './arenaMotion';

describe('ambient arena motion', () => {
  it('runs only when motion is allowed and the 3D floor was rendered', () => {
    expect(shouldAnimateArena(false, true)).toBe(true);
    expect(shouldAnimateArena(true, true)).toBe(false);
    expect(shouldAnimateArena(false, false)).toBe(false);
    expect(shouldAnimateArena(true, false)).toBe(false);
  });
});
