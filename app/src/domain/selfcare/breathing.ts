/**
 * Breathing patterns, as arithmetic.
 *
 * The screen is an animation, but none of the deciding happens in the
 * animation: given a pattern and how long you have been going, this says which
 * phase you are in and how far through it. That keeps the whole thing testable
 * and means a dropped frame, a backgrounded tab or a slow phone cannot drift
 * the count — the clock is the source, not an accumulating counter.
 */

export type PhaseKind = 'in' | 'hold' | 'out' | 'rest';

export interface Phase {
  kind: PhaseKind;
  seconds: number;
}

export interface Pattern {
  id: string;
  name: string;
  blurb: string;
  phases: readonly Phase[];
}

export const PHASE_WORDS: Record<PhaseKind, string> = {
  in: 'Breathe in',
  hold: 'Hold',
  out: 'Breathe out',
  rest: 'Rest',
};

/**
 * Four patterns, and the longest exhale last.
 *
 * All of them are longer out than in, or equal. That is the one thing these
 * have in common and the reason they work: a longer exhale is what actually
 * moves the nervous system, and a pattern that breathed in longer than out
 * would be an anxiety exercise wearing a calm name. `breathing.test.ts` holds
 * that rule for anything added later.
 */
export const PATTERNS: readonly Pattern[] = [
  {
    id: 'calm',
    name: 'Calm',
    blurb: 'In for four, out for six. The one to start with.',
    phases: [
      { kind: 'in', seconds: 4 },
      { kind: 'out', seconds: 6 },
    ],
  },
  {
    id: 'box',
    name: 'Box',
    blurb: 'Four all the way round. Good when your head is racing.',
    phases: [
      { kind: 'in', seconds: 4 },
      { kind: 'hold', seconds: 4 },
      { kind: 'out', seconds: 4 },
      { kind: 'rest', seconds: 4 },
    ],
  },
  {
    id: 'coherent',
    name: 'Even',
    blurb: 'Five and five, slow and level. The easiest to keep up.',
    phases: [
      { kind: 'in', seconds: 5 },
      { kind: 'out', seconds: 5 },
    ],
  },
  {
    id: 'sleep',
    name: 'For sleep',
    blurb: 'In four, hold seven, out eight. Long, and meant to be.',
    phases: [
      { kind: 'in', seconds: 4 },
      { kind: 'hold', seconds: 7 },
      { kind: 'out', seconds: 8 },
    ],
  },
];

export function patternById(id: string | undefined): Pattern | undefined {
  return PATTERNS.find((p) => p.id === id);
}

/** One full round, in seconds. */
export function cycleSeconds(pattern: Pattern): number {
  return pattern.phases.reduce((total, phase) => total + phase.seconds, 0);
}

export interface PhaseAt {
  phase: Phase;
  /** Which phase of the cycle, so a caller can key a transition off it. */
  index: number;
  /** 0→1 through this phase. Drives the circle's size and nothing else. */
  progress: number;
  /** Whole seconds left in this phase, for the number on screen. */
  remaining: number;
  /** Completed rounds so far. */
  cycles: number;
}

/**
 * Where you are, given how long you have been breathing.
 *
 * A pure function of elapsed time, so the animation can call it every frame
 * and never accumulate error: pausing, backgrounding the tab, or a frame
 * arriving late all resolve to the same answer as if none of it had happened.
 */
export function phaseAt(pattern: Pattern, elapsedSeconds: number): PhaseAt {
  const total = cycleSeconds(pattern);
  const safe = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0;
  const cycles = Math.floor(safe / total);
  let into = safe - cycles * total;

  for (let index = 0; index < pattern.phases.length; index += 1) {
    const phase = pattern.phases[index];
    if (into < phase.seconds) {
      return {
        phase,
        index,
        progress: phase.seconds === 0 ? 1 : into / phase.seconds,
        remaining: Math.max(1, Math.ceil(phase.seconds - into)),
        cycles,
      };
    }
    into -= phase.seconds;
  }

  // Only reachable on a floating-point edge exactly at the cycle boundary.
  const last = pattern.phases[pattern.phases.length - 1];
  return { phase: last, index: pattern.phases.length - 1, progress: 1, remaining: 1, cycles };
}

/**
 * How big the circle should be, 0→1.
 *
 * Grows on the way in, holds full, shrinks on the way out, holds small at
 * rest. Separated from `phaseAt` because it is the one piece that is purely
 * presentational — and because a reduced-motion screen wants the words and the
 * count without anything moving at all.
 */
export function scaleAt(at: PhaseAt): number {
  switch (at.phase.kind) {
    case 'in': return at.progress;
    case 'hold': return 1;
    case 'out': return 1 - at.progress;
    case 'rest': return 0;
  }
}
