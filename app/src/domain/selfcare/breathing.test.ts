import { describe, expect, it } from 'vitest';
import { PATTERNS, PHASE_WORDS, cycleSeconds, patternById, phaseAt, scaleAt } from './breathing';

describe('the patterns', () => {
  it('repeats no id and no name', () => {
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
    expect(new Set(PATTERNS.map((p) => p.name)).size).toBe(PATTERNS.length);
  });

  it('names every phase kind it uses', () => {
    for (const pattern of PATTERNS) {
      for (const phase of pattern.phases) {
        expect(PHASE_WORDS[phase.kind], `${pattern.id} ${phase.kind}`).toBeTruthy();
        expect(phase.seconds, `${pattern.id} ${phase.kind}`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The one rule they all share, and the reason they work. A pattern that
   * breathed in for longer than it breathed out would be an anxiety exercise
   * wearing a calm name.
   */
  it('never breathes in for longer than it breathes out', () => {
    for (const pattern of PATTERNS) {
      const inFor = pattern.phases.filter((p) => p.kind === 'in').reduce((n, p) => n + p.seconds, 0);
      const outFor = pattern.phases.filter((p) => p.kind === 'out').reduce((n, p) => n + p.seconds, 0);
      expect(outFor, pattern.id).toBeGreaterThanOrEqual(inFor);
    }
  });

  it('always starts on the in-breath', () => {
    for (const pattern of PATTERNS) expect(pattern.phases[0].kind, pattern.id).toBe('in');
  });

  it('finds one by id', () => {
    expect(patternById('box')?.name).toBe('Box');
    expect(patternById('nope')).toBeUndefined();
  });
});

describe('cycleSeconds', () => {
  it('adds the phases up', () => {
    expect(cycleSeconds(patternById('box')!)).toBe(16);
    expect(cycleSeconds(patternById('calm')!)).toBe(10);
  });
});

describe('phaseAt', () => {
  const box = patternById('box')!;
  const calm = patternById('calm')!;

  it('opens on the in-breath', () => {
    const at = phaseAt(box, 0);
    expect(at.phase.kind).toBe('in');
    expect(at.index).toBe(0);
    expect(at.cycles).toBe(0);
  });

  it('walks the phases in order', () => {
    expect(phaseAt(box, 2).phase.kind).toBe('in');
    expect(phaseAt(box, 5).phase.kind).toBe('hold');
    expect(phaseAt(box, 9).phase.kind).toBe('out');
    expect(phaseAt(box, 13).phase.kind).toBe('rest');
  });

  it('wraps into the next cycle and counts it', () => {
    const at = phaseAt(box, 17);
    expect(at.phase.kind).toBe('in');
    expect(at.cycles).toBe(1);
    expect(phaseAt(box, 33).cycles).toBe(2);
  });

  it('counts down whole seconds, never to zero', () => {
    // Zero on screen with the phase still running reads as a stuck timer.
    expect(phaseAt(calm, 0).remaining).toBe(4);
    expect(phaseAt(calm, 3.5).remaining).toBe(1);
    for (let t = 0; t < 40; t += 0.25) {
      expect(phaseAt(calm, t).remaining, `t=${t}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('runs progress from 0 to 1 within a phase', () => {
    expect(phaseAt(calm, 0).progress).toBeCloseTo(0);
    expect(phaseAt(calm, 2).progress).toBeCloseTo(0.5);
    expect(phaseAt(calm, 3.99).progress).toBeGreaterThan(0.99);
  });

  /**
   * The whole reason this is a function of elapsed time rather than a counter:
   * a late frame, a paused tab, or a slow phone must all land on the same
   * answer as if nothing had happened.
   */
  it('is a pure function of elapsed time, so it cannot drift', () => {
    expect(phaseAt(box, 9)).toEqual(phaseAt(box, 9));
    // Jumping a whole minute forward — a backgrounded tab — is still exact.
    expect(phaseAt(box, 64).phase.kind).toBe('in');
    expect(phaseAt(box, 64).cycles).toBe(4);
  });

  it('treats nonsense time as the start rather than throwing', () => {
    expect(phaseAt(box, -5).phase.kind).toBe('in');
    expect(phaseAt(box, Number.NaN).phase.kind).toBe('in');
  });
});

describe('scaleAt', () => {
  const box = patternById('box')!;

  it('grows in, holds full, shrinks out, holds small', () => {
    expect(scaleAt(phaseAt(box, 0))).toBeCloseTo(0);
    expect(scaleAt(phaseAt(box, 3.99))).toBeGreaterThan(0.99);
    expect(scaleAt(phaseAt(box, 6))).toBe(1);
    expect(scaleAt(phaseAt(box, 8))).toBeCloseTo(1);
    expect(scaleAt(phaseAt(box, 11.99))).toBeLessThan(0.01);
    expect(scaleAt(phaseAt(box, 14))).toBe(0);
  });

  it('stays inside 0 and 1 the whole way round', () => {
    for (const pattern of PATTERNS) {
      for (let t = 0; t < cycleSeconds(pattern) * 2; t += 0.1) {
        const s = scaleAt(phaseAt(pattern, t));
        expect(s, `${pattern.id} t=${t}`).toBeGreaterThanOrEqual(0);
        expect(s, `${pattern.id} t=${t}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
