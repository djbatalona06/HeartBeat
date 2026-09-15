import { describe, expect, it } from 'vitest';
import { THEMES, getTheme } from './index';
import { contrast } from './tokens';

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

/**
 * Which theme draws from which, and which single colour it leads with.
 *
 * `softened` records the one place a brief was deliberately departed from.
 * Black & Gold supplied a literal `#000000`, and no token in this app is
 * allowed to be pure black any more — see the top of `tokens.test.ts` for why.
 * So sponge sits on `#0B0B12`, which is that black with somewhere left to go.
 *
 * It is a flag here rather than a quietly-edited expected value because those
 * are not the same thing. Editing the hex would make this file agree with the
 * code and stop holding it to anything; the flag keeps the brief on record,
 * says the departure was a decision, and still checks the result is the
 * palette's dark rather than some other dark.
 */
const ASSIGNMENT = [
  { id: 'sponge', palette: 'blackAndGold', accent: '#fca311', base: '#000000', softened: true },
  { id: 'shinobi', palette: 'fiery', accent: '#fb8b24', base: null, softened: false },
  { id: 'avatar', palette: 'deepSea', accent: '#00a8e8', base: '#00171f', softened: false },
  { id: 'pony', palette: 'softPastels', accent: '#c8b6ff', base: null, softened: false },
] as const;

/** Every hex in a theme's colours, lowercased, including those inside rgba(). */
function hexesOf(id: string): string[] {
  return Object.values(getTheme(id).colors)
    .flatMap((value) => value.toLowerCase().match(/#[0-9a-f]{6}/g) ?? []);
}

describe('palette assignment', () => {
  for (const { id, palette, accent, base, softened } of ASSIGNMENT) {
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
        const actual = getTheme(id).colors.base.toLowerCase();
        if (!base) {
          expect(PALETTES[palette]).not.toContain(actual);
          return;
        }
        if (!softened) {
          expect(actual).toBe(base);
          return;
        }
        /**
         * Softened off pure black, and still the palette's own dark.
         *
         * Both halves matter. It must no longer *be* the supplied black, or
         * the no-pure-black rule did not happen; and it must be within a
         * hair of it, or "softened" has become cover for repainting the
         * theme. 1.2:1 is well under the 1.4:1 this file's sibling already
         * uses to mean "the same colour, near enough".
         */
        expect(actual, `${id} is still the literal palette black`).not.toBe(base);
        expect(contrast(actual, base), `${id} drifted off ${base}`).toBeLessThan(1.2);
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
