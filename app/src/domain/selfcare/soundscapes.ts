/**
 * Soundscapes, as synthesis recipes rather than audio files.
 *
 * Nothing is downloaded and nothing is bundled: each of these is filtered noise
 * with a slow wobble on it, built by the Web Audio API on the phone. That is
 * the whole reason this feature can exist in an offline-first app of this size
 * — a minute of rain as a file is a megabyte or two, five of them is most of
 * the app, and none of it would work on a plane.
 *
 * What is described here is a recipe, not a sound. The parameters are
 * deliberately plain — what kind of noise, where to put the filter, how fast
 * and how far to move it — so `SoundscapesPage` can build every bed from one
 * small graph rather than five bespoke ones.
 */

export type NoiseKind = 'white' | 'pink' | 'brown';

export interface Soundscape {
  id: string;
  name: string;
  blurb: string;
  /** Brown is the deepest, white the harshest. Most of these want brown. */
  noise: NoiseKind;
  /** Low-pass cutoff in Hz. Lower is further away, and more like weather. */
  cutoff: number;
  /** Resonance. Kept low: a resonant filter on noise whistles. */
  q: number;
  /** How fast the cutoff drifts, in Hz. Under 0.2 reads as breathing. */
  sway: number;
  /** How far it drifts, as a fraction of the cutoff. */
  depth: number;
}

export const SOUNDSCAPES: readonly Soundscape[] = [
  {
    id: 'rain',
    name: 'Rain',
    blurb: 'Steady, on a window, from inside.',
    noise: 'brown',
    cutoff: 1400,
    q: 0.6,
    sway: 0.09,
    depth: 0.28,
  },
  {
    id: 'waves',
    name: 'Waves',
    blurb: 'Slow water arriving and leaving.',
    noise: 'brown',
    cutoff: 700,
    q: 0.7,
    sway: 0.055,
    depth: 0.6,
  },
  {
    id: 'room',
    name: 'A room',
    blurb: 'The hum of somewhere with other people in it.',
    noise: 'brown',
    cutoff: 380,
    q: 0.5,
    sway: 0.03,
    depth: 0.15,
  },
  {
    id: 'wind',
    name: 'Wind',
    blurb: 'Through something, a long way off.',
    noise: 'pink',
    cutoff: 900,
    q: 0.9,
    sway: 0.13,
    depth: 0.45,
  },
  {
    id: 'static',
    name: 'Static',
    blurb: 'Featureless on purpose. For drowning a noisy street.',
    noise: 'white',
    cutoff: 6000,
    q: 0.4,
    sway: 0.02,
    depth: 0.05,
  },
];

export function soundscapeById(id: string | undefined): Soundscape | undefined {
  return SOUNDSCAPES.find((s) => s.id === id);
}

/**
 * Fill a buffer with one of the three noise colours.
 *
 * Pure, and takes its own randomness so a test can hand it a fixed source and
 * get a fixed buffer. Pink uses the Voss-McCartney approximation and brown is a
 * leaky integrator — both are the standard cheap versions, which is right here:
 * this is a background bed, not a measurement signal.
 */
export function fillNoise(out: Float32Array, kind: NoiseKind, random: () => number): void {
  if (kind === 'white') {
    for (let i = 0; i < out.length; i += 1) out[i] = random() * 2 - 1;
    return;
  }

  if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < out.length; i += 1) {
      const white = random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      // 3.5 brings the integrator's output back to roughly ±1.
      out[i] = last * 3.5;
    }
    return;
  }

  // Pink: several octaves of white, each updated half as often as the last.
  const rows = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < out.length; i += 1) {
    let sum = 0;
    for (let row = 0; row < rows.length; row += 1) {
      const every = 1 << row;
      if (i % every === 0) rows[row] = random() * 2 - 1;
      sum += rows[row];
    }
    out[i] = sum / rows.length;
  }
}
