import { describe, expect, it } from 'vitest';
import { BLINK_EVERY, BLINK_FOR, blinkAt, pose } from './pose';

const MOODS = ['happy', 'content', 'sleepy'] as const;
const TIMES = Array.from({ length: 400 }, (_, i) => i * 0.137);

describe('pose', () => {
  it('holds perfectly still under calm, whatever the clock says', () => {
    // Calm is calm mode or reduced motion. The engine draws once and stops on
    // the promise that nothing here depends on `t`.
    for (const mood of MOODS) {
      const first = pose(mood, 0, true);
      for (const t of TIMES) expect(pose(mood, t, true)).toEqual(first);
      expect(first.blink).toBe(0);
    }
  });

  it('still lets a sleepy pet hang its head when calm, because that is the drawing', () => {
    expect(pose('sleepy', 0, true).nod).toBeGreaterThan(0);
    expect(pose('happy', 0, true).nod).toBe(0);
  });

  it('keeps every motion small enough that the pet stays in its frame', () => {
    for (const mood of MOODS) {
      for (const t of TIMES) {
        const p = pose(mood, t, false);
        expect(Math.abs(p.bob)).toBeLessThanOrEqual(0.06);
        expect(p.breath).toBeGreaterThanOrEqual(0);
        expect(p.breath).toBeLessThanOrEqual(1);
        expect(Math.abs(p.yaw)).toBeLessThanOrEqual(0.15);
        expect(Math.abs(p.sway)).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it('moves a happy pet more than a sleepy one', () => {
    const range = (mood: (typeof MOODS)[number]) => {
      const bobs = TIMES.map((t) => pose(mood, t, false).bob);
      return Math.max(...bobs) - Math.min(...bobs);
    };
    expect(range('happy')).toBeGreaterThan(range('content'));
    expect(range('content')).toBeGreaterThan(range('sleepy'));
  });
});

describe('blinkAt', () => {
  it('shuts once per cycle, briefly, and is open the rest of the time', () => {
    const step = 0.004;
    let shut = 0;
    for (let t = 0; t < BLINK_EVERY; t += step) {
      const b = blinkAt(t);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      if (b > 0) shut += step;
    }
    expect(shut).toBeCloseTo(BLINK_FOR, 1);
    expect(blinkAt(BLINK_FOR / 2)).toBeCloseTo(1, 5);
  });

  it('survives a negative clock', () => {
    expect(blinkAt(-BLINK_EVERY + BLINK_FOR / 2)).toBeCloseTo(1, 5);
  });
});
