import { describe, expect, it } from 'vitest';
import { SOUNDSCAPES, fillNoise, soundscapeById } from './soundscapes';

/** A fixed source, so a noise test can assert something exact. */
function seeded(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('the soundscapes', () => {
  it('repeats no id and no name', () => {
    expect(new Set(SOUNDSCAPES.map((s) => s.id)).size).toBe(SOUNDSCAPES.length);
    expect(new Set(SOUNDSCAPES.map((s) => s.name)).size).toBe(SOUNDSCAPES.length);
  });

  it('keeps every recipe inside the range the graph can actually play', () => {
    for (const bed of SOUNDSCAPES) {
      // Above roughly 20kHz there is nothing to hear; below 20 there is nothing
      // but rumble. Q above ~1 on noise starts to whistle.
      expect(bed.cutoff, bed.id).toBeGreaterThan(20);
      expect(bed.cutoff, bed.id).toBeLessThan(20000);
      expect(bed.q, bed.id).toBeGreaterThan(0);
      expect(bed.q, bed.id).toBeLessThanOrEqual(1);
      // A sway above a couple of Hz stops being weather and becomes a siren.
      expect(bed.sway, bed.id).toBeGreaterThan(0);
      expect(bed.sway, bed.id).toBeLessThan(1);
      expect(bed.depth, bed.id).toBeGreaterThan(0);
      expect(bed.depth, bed.id).toBeLessThanOrEqual(1);
    }
  });

  it('never lets the wobble push the cutoff below zero', () => {
    // `depth` is a fraction of the cutoff, and the LFO swings both ways — a
    // depth above 1 would drive the filter frequency negative at the trough.
    for (const bed of SOUNDSCAPES) {
      expect(bed.cutoff - bed.cutoff * bed.depth, bed.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('finds one by id', () => {
    expect(soundscapeById('rain')?.name).toBe('Rain');
    expect(soundscapeById('nope')).toBeUndefined();
  });
});

describe('fillNoise', () => {
  for (const kind of ['white', 'pink', 'brown'] as const) {
    describe(kind, () => {
      it('fills the whole buffer inside the range an audio sample may take', () => {
        // Anything outside ±1 clips, which on a noise bed is audible as a
        // crackle rather than as "louder".
        const out = new Float32Array(4096);
        fillNoise(out, kind, seeded());
        for (let i = 0; i < out.length; i += 1) {
          expect(Number.isFinite(out[i]), `${kind}[${i}]`).toBe(true);
          expect(Math.abs(out[i]), `${kind}[${i}]`).toBeLessThanOrEqual(1);
        }
      });

      it('is not silent', () => {
        const out = new Float32Array(2048);
        fillNoise(out, kind, seeded());
        const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        expect(peak).toBeGreaterThan(0.01);
      });

      it('is deterministic given the same source', () => {
        const a = new Float32Array(512);
        const b = new Float32Array(512);
        fillNoise(a, kind, seeded(7));
        fillNoise(b, kind, seeded(7));
        expect([...a]).toEqual([...b]);
      });
    });
  }

  it('gets darker from white to pink to brown', () => {
    // The colours are the whole point of having three. Average absolute
    // sample-to-sample change is a cheap stand-in for brightness, and it has to
    // fall as the noise gets darker.
    const wiggle = (kind: 'white' | 'pink' | 'brown') => {
      const out = new Float32Array(8192);
      fillNoise(out, kind, seeded(3));
      let total = 0;
      for (let i = 1; i < out.length; i += 1) total += Math.abs(out[i] - out[i - 1]);
      return total / out.length;
    };
    expect(wiggle('white')).toBeGreaterThan(wiggle('pink'));
    expect(wiggle('pink')).toBeGreaterThan(wiggle('brown'));
  });
});
