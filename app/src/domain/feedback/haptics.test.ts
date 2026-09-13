import { describe, expect, it } from 'vitest';
import {
  HAPTIC_KINDS, HAPTIC_PATTERNS, MAX_PATTERN_MS, hapticFor, type HapticContext,
} from './haptics';

/**
 * The rule this file exists for is the first one: **calm mode means silence.**
 *
 * It is the one that fails quietly. A missing buzz is invisible, an unwanted
 * one only annoys the person holding the phone, and reduced motion is an
 * accessibility setting before it is a taste — so nothing about a regression
 * here would ever show up in a screenshot or a type error.
 */

const ON: HapticContext = { calm: false, enabled: true, supported: true };

describe('hapticFor', () => {
  it('plays the pattern for its kind when everything is on', () => {
    for (const kind of HAPTIC_KINDS) {
      expect(hapticFor(kind, ON)).toEqual([...HAPTIC_PATTERNS[kind]]);
    }
  });

  it('is silent under calm mode, for every kind', () => {
    for (const kind of HAPTIC_KINDS) {
      expect(hapticFor(kind, { ...ON, calm: true }), kind).toBeNull();
    }
  });

  it('is silent when the toggle is off', () => {
    for (const kind of HAPTIC_KINDS) {
      expect(hapticFor(kind, { ...ON, enabled: false }), kind).toBeNull();
    }
  });

  it('is silent where the platform has no vibration at all', () => {
    for (const kind of HAPTIC_KINDS) {
      expect(hapticFor(kind, { ...ON, supported: false }), kind).toBeNull();
    }
  });

  it('needs all three to say yes, not any one of them', () => {
    expect(hapticFor('tap', { calm: true, enabled: false, supported: false })).toBeNull();
    expect(hapticFor('tap', { calm: true, enabled: true, supported: true })).toBeNull();
    expect(hapticFor('tap', ON)).not.toBeNull();
  });

  /** Handing back the array itself would let a caller mutate the table for
   *  everybody who buzzes after them. */
  it('hands back a copy, not the table', () => {
    const first = hapticFor('success', ON)!;
    first[0] = 9999;
    expect(hapticFor('success', ON)).toEqual([...HAPTIC_PATTERNS.success]);
  });
});

describe('the patterns themselves', () => {
  it('keeps the vocabulary small enough to tell apart', () => {
    // Four is the budget. The failure mode of "standardised haptic profiles"
    // is fourteen of them, none distinguishable through a pocket.
    expect(HAPTIC_KINDS.length).toBeLessThanOrEqual(4);
  });

  it('gives every kind a distinct pattern', () => {
    const seen = HAPTIC_KINDS.map((k) => HAPTIC_PATTERNS[k].join(','));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('never runs long enough to become a phone that will not stop', () => {
    for (const kind of HAPTIC_KINDS) {
      const total = HAPTIC_PATTERNS[kind].reduce((sum, ms) => sum + ms, 0);
      expect(total, kind).toBeLessThanOrEqual(MAX_PATTERN_MS);
    }
  });

  it('asks for whole positive milliseconds only', () => {
    for (const kind of HAPTIC_KINDS) {
      for (const ms of HAPTIC_PATTERNS[kind]) {
        expect(Number.isInteger(ms), `${kind}: ${ms}`).toBe(true);
        expect(ms, `${kind}: ${ms}`).toBeGreaterThan(0);
      }
    }
  });

  /** `error` must not read as a reward. Heavier and fewer beats than success. */
  it('makes the refusal feel unlike the rewards', () => {
    const error = HAPTIC_PATTERNS.error.reduce((s, ms) => s + ms, 0);
    const success = HAPTIC_PATTERNS.success.reduce((s, ms) => s + ms, 0);
    expect(error).toBeGreaterThan(success);
  });
});
