import { describe, expect, it } from 'vitest';
import { THEMES, getTheme } from './index';

/**
 * Which supplied palette each theme is built from.
 *
 * `tokens.test.ts` already proves every theme is *readable*. It cannot prove a
 * theme is the right colour, and that is the failure this file exists for: a
 * palette is a brief, the brief arrived as five hex values per palette, and
 * the way a brief like that rots is one plausible tweak at a time until the
 * screen no longer resembles what was asked for. Nothing here has an opinion
 * about taste — each case asks only whether the colours the brief named are
 * still the colours the theme uses.
 *
 * Hello Kitty is deliberately absent. Four palettes arrived for five themes,
 * and kitty's own instruction was white highlights on the mascot and nothing
 * else, so its palette is untouched and there is no brief here to hold it to.
 * The mapping is 4→4, which is very likely why there were four.
 */

/** The supplied palettes, as named. */
const PALETTES = {
  blackAndGold: ['#000000', '#14213d', '#fca311', '#e5e5e5', '#ffffff'],
  softPastels: ['#ffd6ff', '#e7c6ff', '#c8b6ff', '#b8c0ff', '#bbd0ff'],
  fiery: ['#5f0f40', '#9a031e', '#fb8b24', '#e36414', '#0f4c5c'],
  deepSea: ['#ffffff', '#00171f', '#003459', '#007ea7', '#00a8e8'],
} as const;

/** Which theme draws from which, and which single colour it leads with. */
const ASSIGNMENT = [
  { id: 'sponge', palette: 'blackAndGold', accent: '#fca311', base: '#000000' },
  { id: 'shinobi', palette: 'fiery', accent: '#fb8b24', base: null },
  { id: 'avatar', palette: 'deepSea', accent: '#00a8e8', base: '#00171f' },
  { id: 'pony', palette: 'softPastels', accent: '#c8b6ff', base: null },
] as const;

/** Every hex in a theme's colours, lowercased, including those inside rgba(). */
function hexesOf(id: string): string[] {
  return Object.values(getTheme(id).colors)
    .flatMap((value) => value.toLowerCase().match(/#[0-9a-f]{6}/g) ?? []);
}

describe('palette assignment', () => {
  for (const { id, palette, accent, base } of ASSIGNMENT) {
    describe(`${id} draws from ${palette}`, () => {
      it('leads with the palette\'s own accent', () => {
        expect(getTheme(id).colors.accent.toLowerCase()).toBe(accent);
        expect(PALETTES[palette]).toContain(accent);
      });

      /**
       * Two palettes supply a dark and two do not. Soft Pastels is five light
       * tints, and Fiery's darkest is a mid crimson violet, so both themes
       * needed a page colour invented for them — which is a real decision and
       * not a drift, so it is recorded as `null` rather than asserted against
       * a palette that never had one.
       */
      it(base ? 'sits on a colour the palette supplied' : 'needed a dark invented for it', () => {
        if (base) expect(getTheme(id).colors.base.toLowerCase()).toBe(base);
        else expect(PALETTES[palette]).not.toContain(getTheme(id).colors.base.toLowerCase());
      });
    });
  }

  it('spends all four palettes, one per theme', () => {
    expect(new Set(ASSIGNMENT.map((a) => a.palette)).size).toBe(Object.keys(PALETTES).length);
  });

  it('leaves Hello Kitty out of the repalette entirely', () => {
    expect(ASSIGNMENT.map((a) => a.id)).not.toContain('kitty');
    // Its ribbon pink, which every other value in that pack is built around.
    expect(getTheme('kitty').colors.accent.toLowerCase()).toBe('#ff8fb0');
  });

  it('names a theme that actually exists, for every assignment', () => {
    const ids = THEMES.map((theme) => theme.id);
    for (const { id } of ASSIGNMENT) expect(ids).toContain(id);
  });

  /**
   * The one way a repalette silently half-lands: the accent moves, the borders
   * and muted tones it was derived from do not, and the theme quietly becomes
   * two palettes at once.
   */
  it('leaves no colour behind from the palette it replaced', () => {
    // The four accents these themes led with before the repalette.
    const REPLACED = ['#f7d94c', '#f0803c', '#d6aaf5', '#6ebeeb'];
    for (const { id } of ASSIGNMENT) {
      for (const stale of REPLACED) {
        expect(hexesOf(id), `${id} still carries ${stale}`).not.toContain(stale);
      }
    }
  });
});
