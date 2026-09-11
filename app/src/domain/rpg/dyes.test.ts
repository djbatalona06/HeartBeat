import { describe, expect, it } from 'vitest';
import { DEFAULT_DYE_ID, DYES, DYE_PREFIX, dyeById, dyeStyle } from './dyes';
import { THEMES } from '../../themes';
import { contrast, luminance } from '../../themes/tokens';

describe('the dye catalogue', () => {
  it('repeats no id and no name', () => {
    expect(new Set(DYES.map((d) => d.id)).size).toBe(DYES.length);
    expect(new Set(DYES.map((d) => d.name)).size).toBe(DYES.length);
  });

  it('prefixes every id, so dyes and gear cannot collide in one table', () => {
    // Ownership is the shared `inventory` table keyed by catalogue string. The
    // prefix is the whole of what keeps `dye-plum` from being read as gear.
    for (const dye of DYES) expect(dye.id, dye.name).toMatch(new RegExp(`^${DYE_PREFIX}`));
  });

  it('gives every dye three real six-digit hexes', () => {
    // `luminance` throws on anything else, which is what caught a stray
    // non-ASCII character inside one of these the first time they were typed.
    for (const dye of DYES) {
      for (const [role, value] of Object.entries({ ink: dye.ink, accent: dye.accent, muted: dye.muted })) {
        expect(value, `${dye.id} ${role}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(() => luminance(value), `${dye.id} ${role}`).not.toThrow();
      }
    }
  });

  it('ships exactly one free starter, and it is the default', () => {
    const free = DYES.filter((d) => d.price === 0);
    expect(free).toHaveLength(1);
    expect(free[0].id).toBe(DEFAULT_DYE_ID);
  });

  it('charges something for every other one', () => {
    for (const dye of DYES) {
      if (dye.id === DEFAULT_DYE_ID) continue;
      expect(dye.price, dye.id).toBeGreaterThan(0);
    }
  });

  /**
   * The duty a literal colour takes on.
   *
   * Chrome tints off `--color-accent` and inherits whatever pack is on. A dye
   * cannot: it is the thing being chosen, so it carries real hexes — and that
   * means it, not the theme engine, is now responsible for staying visible on
   * all five packs, which run from near-black to near-white behind the bird.
   */
  describe('stays legible on every theme pack', () => {
    for (const theme of THEMES) {
      it(`${theme.name}`, () => {
        for (const dye of DYES) {
          // 3:1 is the WCAG bar for a large non-text graphic, which is exactly
          // what a 100×100 bird is.
          expect(contrast(dye.ink, theme.colors.base), `${dye.id} on ${theme.id}`)
            .toBeGreaterThanOrEqual(3);
        }
      });
    }
  });

  it('keeps the accent distinct from the ink, or the markings disappear', () => {
    // Every mascot paints its ear insides and cheeks in the accent over a body
    // in the ink. Too close and the bird is a silhouette.
    for (const dye of DYES) {
      expect(contrast(dye.ink, dye.accent), dye.id).toBeGreaterThanOrEqual(1.4);
    }
  });
});

describe('dyeById', () => {
  it('finds one, and returns nothing for a name nobody owns', () => {
    expect(dyeById('dye-plum')?.name).toBe('Plum');
    expect(dyeById('dye-nonsense')).toBeUndefined();
    expect(dyeById(undefined)).toBeUndefined();
  });
});

describe('dyeStyle', () => {
  it('overrides exactly the three properties every mascot paints in', () => {
    const style = dyeStyle('dye-plum');
    expect(Object.keys(style).sort()).toEqual(['--color-accent', '--color-text', '--color-text-muted']);
  });

  it('leaves the starter bird alone, so it inherits the pack as it always did', () => {
    // Pinning the default to a brown would make one pack look untouched and
    // the other four look repainted by a dye nobody chose.
    expect(dyeStyle(DEFAULT_DYE_ID)).toEqual({});
    expect(dyeStyle(undefined)).toEqual({});
  });

  it('ignores an id that is not in the catalogue rather than emitting empty vars', () => {
    // A dye removed in a later version is still written on somebody's avatar.
    // Falling back to the pack is right; `--color-text: undefined` is not.
    expect(dyeStyle('dye-retired')).toEqual({});
  });
});
