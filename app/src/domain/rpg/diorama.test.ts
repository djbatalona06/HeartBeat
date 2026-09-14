import { describe, expect, it } from 'vitest';
import {
  DAWN_HOUR, DUSK_HOUR, FRESH_MOMENTUM, LOW_MOOD_GAP, QUIET_DAYS, THIN_WEEK,
  elevation, isNight, lightAngle, lightingAt, moodLift, normalizeHour,
  shadowDirection, shadowLength, variantFor, type Momentum,
} from './diorama';

describe('normalizeHour', () => {
  it('wraps a clock that has run past midnight', () => {
    expect(normalizeHour(25)).toBe(1);
    expect(normalizeHour(-1)).toBe(23);
    expect(normalizeHour(48)).toBe(0);
  });

  it('falls back to midday rather than producing NaN', () => {
    expect(normalizeHour(Number.NaN)).toBe(12);
    expect(normalizeHour(Number.POSITIVE_INFINITY)).toBe(12);
  });
});

describe('where the light is', () => {
  it('rises in the east at dawn and sets in the west at dusk', () => {
    expect(lightAngle(DAWN_HOUR)).toBeCloseTo(0);
    expect(lightAngle(12)).toBeCloseTo(Math.PI / 2);
    expect(lightAngle(DUSK_HOUR - 0.001)).toBeCloseTo(Math.PI, 2);
  });

  it('knows night from day', () => {
    expect(isNight(12)).toBe(false);
    expect(isNight(DAWN_HOUR)).toBe(false);
    expect(isNight(DUSK_HOUR)).toBe(true);
    expect(isNight(3)).toBe(true);
    expect(isNight(23)).toBe(true);
  });

  it('gives the moon the same arc as the sun', () => {
    // Midnight is the moon's peak the way noon is the sun's.
    expect(lightAngle(0)).toBeCloseTo(Math.PI / 2);
    expect(lightAngle(DUSK_HOUR)).toBeCloseTo(0);
  });

  it('points shadows directly away from the light, wrapped into one turn', () => {
    for (const hour of [0, 3, 6, 9, 12, 15, 18, 21]) {
      const angle = lightAngle(hour);
      const away = shadowDirection(angle);
      expect(away).toBeGreaterThanOrEqual(0);
      expect(away).toBeLessThan(Math.PI * 2);
      // The two are half a turn apart, whichever way round you measure.
      const gap = Math.abs(away - angle);
      expect(Math.min(gap, Math.PI * 2 - gap)).toBeCloseTo(Math.PI);
    }
  });
});

describe('shadow length', () => {
  /**
   * The regression test for the inverted formula in the original spec. It gave
   * `abs(cos(lightAngle))`, which is zero at dawn and longest at noon — exactly
   * backwards. If someone "restores" it, these two fail.
   */
  it('is longest at the horizons and shortest at the peak', () => {
    const dawn = shadowLength(10, lightAngle(DAWN_HOUR));
    const noon = shadowLength(10, lightAngle(12));
    const dusk = shadowLength(10, lightAngle(DUSK_HOUR - 0.001));

    expect(dawn).toBeGreaterThan(noon);
    expect(dusk).toBeGreaterThan(noon);
    expect(dawn).toBeCloseTo(dusk, 1);
  });

  it('never vanishes, so nothing in the garden looks like it is floating', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      expect(shadowLength(10, lightAngle(hour), isNight(hour))).toBeGreaterThan(0);
    }
  });

  it('never exceeds the caster, except by the night allowance', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      expect(shadowLength(10, lightAngle(hour))).toBeLessThanOrEqual(10);
    }
    // Moonrise, not midnight: midnight is the moon's *peak*, where its shadow
    // is at its shortest, exactly as noon is the sun's.
    expect(shadowLength(10, lightAngle(DUSK_HOUR), true)).toBeGreaterThan(10);
  });

  it('draws nothing from a nonsense base rather than NaN', () => {
    expect(shadowLength(Number.NaN, 1)).toBe(0);
    expect(shadowLength(-5, 1)).toBe(0);
  });

  it('keeps elevation inside zero and one', () => {
    for (let hour = 0; hour < 24; hour += 0.5) {
      const e = elevation(lightAngle(hour));
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });
});

describe('lightingAt', () => {
  it('gathers one frame of light from one clock reading', () => {
    const noon = lightingAt(12, 8);
    expect(noon.isNight).toBe(false);
    expect(noon.elevation).toBeCloseTo(1);
    expect(noon.shadowDirection).toBeCloseTo(shadowDirection(noon.lightAngle));

    const midnight = lightingAt(0, 8);
    expect(midnight.isNight).toBe(true);
    expect(midnight.shadowLength).toBeGreaterThan(noon.shadowLength);
  });
});

describe('which face the island wears', () => {
  const good: Momentum = { daysSinceLog: 0, loggedDays: 6, joy: 7, moody: 3 };

  it('stays light for a couple who are logging', () => {
    expect(variantFor(good)).toBe('Light');
  });

  it('starts light for a couple with no history at all', () => {
    // Opening the app for the first time must not find the garden already dark.
    expect(variantFor(FRESH_MOMENTUM)).toBe('Light');
  });

  it('turns dark after three quiet days', () => {
    expect(variantFor({ ...good, daysSinceLog: QUIET_DAYS - 1 })).toBe('Light');
    expect(variantFor({ ...good, daysSinceLog: QUIET_DAYS })).toBe('Dark');
  });

  it('turns dark on a week with almost nothing in it', () => {
    expect(variantFor({ ...good, daysSinceLog: 1, loggedDays: THIN_WEEK })).toBe('Dark');
    expect(variantFor({ ...good, daysSinceLog: 1, loggedDays: THIN_WEEK + 1 })).toBe('Light');
  });

  it('does not call a thin week dark if they logged today', () => {
    // Someone coming back after a gap should see the light return the same day,
    // not be told their week was bad while they are standing there fixing it.
    expect(variantFor({ ...good, daysSinceLog: 0, loggedDays: 1 })).toBe('Light');
  });

  it('turns dark on a sustained low stretch', () => {
    expect(variantFor({ ...good, joy: 3, moody: 5 })).toBe('Dark');
    expect(moodLift({ ...good, joy: 3, moody: 5 })).toBe(LOW_MOOD_GAP);
  });

  it('does not turn dark on one hard day', () => {
    // A single point of dip is noise; the dark variant describes a stretch.
    expect(variantFor({ ...good, joy: 4, moody: 5 })).toBe('Light');
  });

  it('ignores mood it does not have', () => {
    expect(moodLift({ daysSinceLog: 0, loggedDays: 5 })).toBeUndefined();
    expect(moodLift({ daysSinceLog: 0, loggedDays: 5, joy: Number.NaN, moody: 2 })).toBeUndefined();
    expect(variantFor({ daysSinceLog: 0, loggedDays: 5 })).toBe('Light');
  });
});
