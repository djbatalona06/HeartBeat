import type { HapticKind } from '../feedback/haptics';

/**
 * What each buzz sounds like, for a phone on a table or a laptop.
 *
 * Keyed by `HapticKind` rather than a list of its own: sound speaks the same
 * four-word vocabulary as the motor, so there is no second list to keep in
 * step. `tones.test.ts` fails in both directions if they drift.
 *
 * Pure on purpose, like `domain/feedback/haptics.ts` — the numbers worth
 * protecting (how long, how loud) are here where vitest can reach them, and
 * `pwa/sound.ts` only schedules them.
 */

export interface Note {
  /** Hz. */
  freq: number;
  /** Offset from the start of the tone. */
  startMs: number;
  durMs: number;
  type: OscillatorType;
  /** Peak of the envelope, before nothing — there is no master boost. */
  gain: number;
}

/** A tone you notice ending is already too long. */
export const MAX_TONE_MS = 400;
/** Sound is louder in a room than a buzz is in a pocket. */
export const MAX_GAIN = 0.15;

export const TONES: Record<HapticKind, Note[]> = {
  /** One short blip. */
  tap: [{ freq: 880, startMs: 0, durMs: 60, type: 'sine', gain: 0.08 }],
  /** Two notes, up a fourth. */
  success: [
    { freq: 660, startMs: 0, durMs: 110, type: 'sine', gain: 0.1 },
    { freq: 880, startMs: 90, durMs: 160, type: 'sine', gain: 0.1 },
  ],
  /** A rising major arpeggio. */
  levelUp: [
    { freq: 523, startMs: 0, durMs: 120, type: 'triangle', gain: 0.12 },
    { freq: 659, startMs: 100, durMs: 120, type: 'triangle', gain: 0.12 },
    { freq: 784, startMs: 200, durMs: 190, type: 'triangle', gain: 0.12 },
  ],
  /** A low falling pair, so it does not read as a reward. */
  error: [
    { freq: 330, startMs: 0, durMs: 130, type: 'triangle', gain: 0.1 },
    { freq: 247, startMs: 120, durMs: 180, type: 'triangle', gain: 0.1 },
  ],
};

/** When the last note of a tone ends, in ms. */
export function toneLength(kind: HapticKind): number {
  return Math.max(...TONES[kind].map((n) => n.startMs + n.durMs));
}
