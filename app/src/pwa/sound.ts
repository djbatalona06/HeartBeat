import type { HapticKind } from '../domain/feedback/haptics';
import { TONES } from '../domain/audio/tones';

/**
 * The one place this app makes an interface sound. The sibling of
 * `pwa/haptics.ts`, and deliberately as small: which tones exist and how loud
 * they may be is `domain/audio/tones.ts`, where vitest can reach it.
 */

/** Lazy, then reused. Created on the first `play()`, which is always inside a
 *  tap — browsers refuse to start audio outside a user gesture. */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
  ctx = new window.AudioContext();
  return ctx;
}

/**
 * Play the tone for `kind`, or do nothing, and never throw either way.
 *
 * Off unless somebody turned it on, and Calm silences it absolutely — the same
 * rule `hapticFor` holds for the buzz. Call it from inside the tap, before any
 * `await`, for the same reason as `buzz()`.
 */
export function play(kind: HapticKind, at: { calm: boolean; enabled: boolean }): void {
  if (at.calm || !at.enabled) return;
  try {
    const audio = context();
    if (!audio) return;
    if (audio.state === 'suspended') void audio.resume();
    const t0 = audio.currentTime;
    for (const note of TONES[kind]) {
      const start = t0 + note.startMs / 1000;
      const end = start + note.durMs / 1000;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = note.type;
      osc.frequency.value = note.freq;
      // A soft attack and release, so no note starts or stops with a click.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.gain, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    // The worst outcome of a missing sound is a missing sound.
  }
}
