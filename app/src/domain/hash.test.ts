import { describe, expect, it } from 'vitest';
import { hash, roll } from './hash';
import { hash as hashFromQuiz } from './study/quiz';

describe('hash', () => {
  it('is stable across calls', () => {
    expect(hash('card-42')).toBe(hash('card-42'));
  });

  it('separates inputs that differ by one character', () => {
    expect(hash('card-42')).not.toBe(hash('card-43'));
  });

  it('is an unsigned 32-bit integer', () => {
    for (const text of ['', 'a', 'card-42', 'a much longer string than the others']) {
      const h = hash(text);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('handles the empty string rather than throwing', () => {
    expect(hash('')).toBe(2166136261);
  });

  // The point of the extraction: quiz.ts re-exports this exact function, so a
  // change here cannot silently relay the deck's choices differently.
  it('is the same function quiz.ts exports', () => {
    expect(hashFromQuiz).toBe(hash);
  });
});

describe('roll', () => {
  it('stays inside [0, 1)', () => {
    for (let seed = 0; seed < 50; seed += 7) {
      for (let step = 0; step < 40; step += 1) {
        const r = roll(seed, step);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(1);
      }
    }
  });

  it('replays the same value for the same seed and step', () => {
    expect(roll(1234, 3)).toBe(roll(1234, 3));
  });

  it('moves between consecutive steps', () => {
    // A bare FNV walk correlates badly here; a fight where every swing lands
    // identically is not variance, so this is the property worth pinning.
    const seed = hash('foe-magpie');
    const first = [0, 1, 2, 3, 4, 5].map((step) => roll(seed, step));
    expect(new Set(first).size).toBe(first.length);
  });

  it('spreads roughly evenly across the unit interval', () => {
    const seed = hash('spread');
    const buckets = [0, 0, 0, 0];
    for (let step = 0; step < 4000; step += 1) {
      buckets[Math.floor(roll(seed, step) * 4)] += 1;
    }
    // A fair spread is 1000 each. Generous bounds — this catches a stuck or
    // clumped generator, not a statistical imperfection.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });

  it('differs between seeds at the same step', () => {
    expect(roll(hash('a'), 1)).not.toBe(roll(hash('b'), 1));
  });
});
