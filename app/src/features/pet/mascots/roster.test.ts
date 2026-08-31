/**
 * NOTICE.md makes one promise about this repository that is easy to break by
 * accident and expensive to break in public: no third-party artwork, and no
 * rights holder's character. A pet you live with on your home screen is a much
 * stronger claim than a palette label, so the same guard `pets.test.ts` puts on
 * the sixteen collectibles is put here on the five mascots.
 */
import { describe, expect, it } from 'vitest';
import { FALLBACK_MASCOT_ID, MASCOT_ROSTER, mascotIdentity } from './roster';

/** The theme ids in `themes/index.ts`. Every one of them needs a pet. */
const THEME_IDS = ['kitty', 'sponge', 'shinobi', 'avatar', 'pony'];

/** The same list `domain/rpg/pets.test.ts` refuses, for the same reason. */
const BORROWED = /hello kitty|sanrio|spongebob|naruto|pikachu|mickey/i;

describe('MASCOT_ROSTER', () => {
  it('gives every theme its own mascot and nobody a shared one', () => {
    expect(Object.keys(MASCOT_ROSTER).sort()).toEqual([...THEME_IDS].sort());
    expect(new Set(Object.values(MASCOT_ROSTER).map((m) => m.name)).size).toBe(THEME_IDS.length);
  });

  it('names no mascot after anybody else\'s character', () => {
    for (const [id, mascot] of Object.entries(MASCOT_ROSTER)) {
      expect(mascot.name, id).not.toMatch(BORROWED);
      expect(mascot.species, id).not.toMatch(BORROWED);
      expect(mascot.blurb, id).not.toMatch(BORROWED);
    }
  });

  it('keeps every name to one warm word, the way Ribbon Cat is one plain phrase', () => {
    for (const [id, mascot] of Object.entries(MASCOT_ROSTER)) {
      expect(mascot.name, id).toMatch(/^[A-Z][a-z]+$/);
      expect(mascot.blurb.length, id).toBeGreaterThan(20);
    }
  });
});

describe('mascotIdentity', () => {
  it('answers with the theme\'s own mascot', () => {
    expect(mascotIdentity('pony').name).toBe(MASCOT_ROSTER.pony.name);
  });

  it('falls back rather than returning a hole for a theme id it has never seen', () => {
    // An old value left in localStorage resolves to the fallback theme, so the
    // mascot has to resolve with it or the home screen renders undefined.
    expect(mascotIdentity('a-theme-that-was-removed')).toBe(MASCOT_ROSTER[FALLBACK_MASCOT_ID]);
    expect(mascotIdentity('')).toBe(MASCOT_ROSTER[FALLBACK_MASCOT_ID]);
  });
});
