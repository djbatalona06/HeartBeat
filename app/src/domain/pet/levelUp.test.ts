import { describe, expect, it } from 'vitest';
import { isBigLevelUp, levelUpSince } from './levelUp';

describe('levelUpSince', () => {
  /** A missing value is "unknown", not "zero", or every fresh install would
   *  celebrate whatever level the couple is already on. */
  it('is null when this phone has never recorded a level', () => {
    expect(levelUpSince(null, 12)).toBeNull();
  });

  it('is null when the level has not moved, or has gone down', () => {
    expect(levelUpSince(5, 5)).toBeNull();
    expect(levelUpSince(6, 5)).toBeNull();
  });

  it('returns the final level of a jump, once, however far it went', () => {
    expect(levelUpSince(4, 5)).toBe(5);
    expect(levelUpSince(3, 9)).toBe(9);
  });
});

describe('isBigLevelUp', () => {
  it('is true landing on a level that opens a garden plot', () => {
    expect(isBigLevelUp(1, 2)).toBe(true);
    expect(isBigLevelUp(27, 28)).toBe(true);
  });

  /** A jump that passes a plot level without landing on it still opened one. */
  it('is true when a jump passes a plot level', () => {
    expect(isBigLevelUp(3, 5)).toBe(true);
  });

  it('is false for levels that open no plot', () => {
    expect(isBigLevelUp(2, 3)).toBe(false);
    expect(isBigLevelUp(5, 7)).toBe(false);
  });

  it('does not count the level you started on', () => {
    expect(isBigLevelUp(4, 5)).toBe(false);
  });
});
