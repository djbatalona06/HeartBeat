import { describe, expect, it } from 'vitest';
import { SUNRISE, SUNSET, msUntilNextHour, phaseAt, sunAt } from './schedule';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

describe('sunAt', () => {
  it('puts the sun below the horizon before sunrise and after sunset', () => {
    for (const h of HOURS) {
      expect(sunAt(h).night, `hour ${h}`).toBe(h < SUNRISE || h >= SUNSET);
    }
  });

  it('travels left to right across the day and stops at the edges', () => {
    const xs = HOURS.map((h) => sunAt(h).x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i], `hour ${i} went backwards`).toBeGreaterThanOrEqual(xs[i - 1]);
    }
    expect(sunAt(0).x).toBe(60);
    expect(sunAt(23).x).toBe(340);
  });

  it('is highest in the middle of the day', () => {
    const noon = Math.round((SUNRISE + SUNSET - 1) / 2);
    // Lower y is higher in the sky.
    expect(sunAt(noon).y).toBeLessThan(sunAt(SUNRISE).y);
    expect(sunAt(noon).y).toBeLessThan(sunAt(SUNSET - 1).y);
  });

  it('stays inside the viewBox it is drawn in', () => {
    for (const h of HOURS) {
      const { x, y } = sunAt(h);
      expect(x, `hour ${h} x`).toBeGreaterThanOrEqual(0);
      expect(x, `hour ${h} x`).toBeLessThanOrEqual(400);
      expect(y, `hour ${h} y`).toBeGreaterThanOrEqual(0);
      expect(y, `hour ${h} y`).toBeLessThanOrEqual(260);
    }
  });
});

describe('phaseAt', () => {
  /**
   * The one that matters. Two modules used to own the idea of night — `sunAt`
   * decided whether to draw stars, and anything wanting to *name* the hour had
   * to write its own boundaries. A garden that draws stars while calling itself
   * daytime is a bug nobody files and everybody sees, so the agreement is
   * pinned for all twenty-four hours rather than trusted.
   */
  it('calls it night exactly when the sun is down', () => {
    for (const h of HOURS) {
      expect(phaseAt(h) === 'night', `hour ${h}`).toBe(sunAt(h).night);
    }
  });

  it('runs night → dawn → day → dusk → night across a full day', () => {
    expect(HOURS.map(phaseAt)).toEqual([
      ...Array(SUNRISE).fill('night'),
      'dawn', 'dawn', 'dawn',
      'day', 'day', 'day', 'day', 'day', 'day', 'day', 'day',
      'dusk', 'dusk',
      ...Array(24 - SUNSET).fill('night'),
    ]);
  });

  it('floors a fractional hour rather than falling through', () => {
    expect(phaseAt(SUNRISE + 0.9)).toBe('dawn');
    expect(phaseAt(SUNSET - 0.1)).toBe('dusk');
  });

  it('never returns anything outside the four phases', () => {
    const named = new Set(['dawn', 'day', 'dusk', 'night']);
    for (const h of HOURS) expect(named.has(phaseAt(h)), `hour ${h}`).toBe(true);
  });
});

describe('msUntilNextHour', () => {
  const at = (m: number, s: number, ms = 0) => new Date(2026, 0, 1, 9, m, s, ms);

  it('is a full hour exactly on the hour, never zero', () => {
    // The spin case: a caller that reschedules itself from a zero here would
    // wake in a tight loop for as long as the tab stayed open.
    expect(msUntilNextHour(at(0, 0))).toBe(3_600_000);
  });

  it('counts down through the hour', () => {
    expect(msUntilNextHour(at(30, 0))).toBe(1_800_000);
    expect(msUntilNextHour(at(59, 59, 999))).toBe(1);
  });

  it('stays inside one hour for every minute and second of one', () => {
    for (let m = 0; m < 60; m += 1) {
      for (const s of [0, 17, 59]) {
        const ms = msUntilNextHour(at(m, s));
        expect(ms, `${m}:${s}`).toBeGreaterThan(0);
        expect(ms, `${m}:${s}`).toBeLessThanOrEqual(3_600_000);
      }
    }
  });
});
