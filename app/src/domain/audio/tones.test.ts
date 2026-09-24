import { describe, expect, it } from 'vitest';
import { HAPTIC_KINDS } from '../feedback/haptics';
import { MAX_GAIN, MAX_TONE_MS, TONES, toneLength } from './tones';

describe('TONES', () => {
  it('has a tone for every haptic kind, and nothing else', () => {
    expect(Object.keys(TONES).sort()).toEqual([...HAPTIC_KINDS].sort());
  });

  it.each(HAPTIC_KINDS)('%s stays short, quiet and audible', (kind) => {
    expect(TONES[kind].length).toBeGreaterThan(0);
    expect(toneLength(kind)).toBeLessThanOrEqual(MAX_TONE_MS);
    for (const note of TONES[kind]) {
      expect(note.gain).toBeGreaterThan(0);
      expect(note.gain).toBeLessThanOrEqual(MAX_GAIN);
      expect(note.freq).toBeGreaterThanOrEqual(150);
      expect(note.freq).toBeLessThanOrEqual(2000);
    }
  });

  it('pins the caps the spec published', () => {
    expect(MAX_TONE_MS).toBe(400);
    expect(MAX_GAIN).toBeLessThanOrEqual(0.15);
  });
});
