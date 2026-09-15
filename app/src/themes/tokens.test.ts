import { describe, expect, it } from 'vitest';
import { THEMES } from './index';
import { SHARED_TOKENS, contrast, darkVariantOf, themeToCssVars } from './tokens';
import type { ThemeMode } from './types';

/**
 * A theme that ships unreadable is worse than no theme, and it is very easy to
 * pick a pretty accent that fails against its own surface. These run in CI so
 * an unreadable palette cannot land.
 *
 * Every theme now has two palettes, and both go through the same four checks.
 * That is the whole reason a light mode was safe to add: a white ground is a
 * far easier place to put unreadable text than a dark one — a muted grey that
 * looked merely quiet on `#00171f` is invisible on `#ffffff` — and without this
 * loop the five new palettes would have been the only ones in the app nothing
 * was checking.
 */
describe('theme palettes', () => {
  it('has a unique id per theme', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const theme of THEMES) {
    const variants: { mode: ThemeMode; variant: ReturnType<typeof darkVariantOf> }[] = [
      { mode: 'dark', variant: darkVariantOf(theme) },
      { mode: 'light', variant: theme.light },
    ];

    for (const { mode, variant } of variants) {
      describe(`${theme.name} (${mode})`, () => {
        it('body text clears WCAG AA against the card surface', () => {
          expect(contrast(variant.colors.text, variant.opaqueSurface)).toBeGreaterThanOrEqual(4.5);
        });

        it('muted text clears AA large against the card surface', () => {
          // Muted text is only ever used at >=18px or bold, so 3:1 is the bar.
          const value = variant.colors.textMuted.startsWith('#')
            ? variant.colors.textMuted
            : null;
          if (!value) return; // rgba() muted tones are composited; covered visually
          expect(contrast(value, variant.opaqueSurface)).toBeGreaterThanOrEqual(3);
        });

        it('accent text is legible on the accent fill', () => {
          expect(contrast(variant.colors.accentText, variant.colors.accent))
            .toBeGreaterThanOrEqual(4.5);
        });

        it('body text clears AA against the page base', () => {
          expect(contrast(variant.colors.text, variant.colors.base)).toBeGreaterThanOrEqual(4.5);
        });

        it('emits every css variable the stylesheet consumes', () => {
          const vars = themeToCssVars(theme, mode);
          for (const key of ['--color-base', '--color-surface', '--color-text', '--color-accent', '--radius', '--motion-medium']) {
            expect(vars[key], key).toBeTruthy();
          }
        });
      });
    }

    describe(`${theme.name}`, () => {
      it('is actually light in its light palette and dark in its dark one', () => {
        // The ask was that half of every theme be white-based, and a `light`
        // palette that quietly copied the dark one would satisfy every contrast
        // check above while satisfying none of that.
        expect(theme.isLight).toBe(false);
        expect(theme.light.isLight).toBe(true);
        expect(contrast(theme.light.colors.base, '#ffffff')).toBeLessThan(1.4);
        expect(contrast(theme.colors.base, '#ffffff')).toBeGreaterThan(4.5);
      });

      it('keeps its accent across both palettes, so it is one theme', () => {
        expect(theme.light.colors.accent).toBe(theme.colors.accent);
      });

      it('lightens the card shadow, which is not a colour and still has a ground', () => {
        // Every pack's own shadow is black at half alpha or more — depth over
        // ink, a smudge over white. It cannot be corrected in the stylesheet
        // because `applyTheme` writes it as an inline style, so it has to come
        // out of `themeToCssVars` different, and this is what says so.
        expect(themeToCssVars(theme, 'dark')['--shadow']).toBe(theme.shape.shadow);
        expect(themeToCssVars(theme, 'light')['--shadow']).not.toBe(theme.shape.shadow);
      });
    });
  }
});

/**
 * No token is pure black or pure white.
 *
 * ## Why this is asserted on emitted values, not on the source
 *
 * The obvious spelling is a grep for `#000|#fff` over the repository, and it is
 * wrong in both directions.
 *
 * It is **too weak**: a black composed at emit time — `color-mix` resolving to
 * one, a colour built from parts — never appears as a literal and sails
 * straight past. `themeToCssVars` is where a token becomes real, so that is
 * where the question has to be asked.
 *
 * It is **too strong**: `styles.css` uses `linear-gradient(#000 0 0)` twice as
 * a `mask` sentinel, where `mask-mode` is alpha and only the alpha channel is
 * read — any opaque colour behaves identically, so that black is not a colour
 * at all. A grep would also flag the `'#ffffff'` reference constant a few lines
 * below in this very file, which exists to prove the light palettes *are*
 * light. Failing the build over either would teach people to route around the
 * check, which is worse than not having it.
 *
 * ## What "no pure black" is actually for
 *
 * Pure black next to pure white is the highest contrast a screen can produce,
 * and on an OLED phone at night it is a hole with a light in it. The four AA
 * checks above already guarantee legibility; this guarantees the palette has
 * somewhere darker to go and somewhere lighter to come back to — which is what
 * makes a shadow read as depth instead of as a smudge.
 */
describe('no token is pure black or pure white', () => {
  /** Colour tokens. Layout, motion and type are not colours and cannot fail. */
  const COLOUR_KEYS = [
    '--color-base', '--color-surface', '--color-surface-muted', '--color-border',
    '--color-text', '--color-text-muted', '--color-accent', '--color-accent-text',
    '--color-danger', '--color-success', '--shadow-color', '--scrim', '--glass',
    '--hairline',
  ];

  /**
   * The escape hatch, deliberately empty.
   *
   * It exists so that a future high-contrast mode — where pure black on pure
   * white is the *point* — has a door that is opened on purpose and named,
   * rather than by deleting this test. Nothing qualifies today.
   */
  const HIGH_CONTRAST_EXEMPT: string[] = [];

  /** Both spellings of each, since a pack may write either. */
  const FORBIDDEN = [
    /^#000$/i, /^#000000$/i, /^#fff$/i, /^#ffffff$/i,
    /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/i,
    /^rgba?\(\s*255\s*,\s*255\s*,\s*255\s*[,)]/i,
  ];

  for (const theme of THEMES) {
    for (const mode of ['dark', 'light'] as ThemeMode[]) {
      it(`${theme.name} (${mode}) emits no pure black or white`, () => {
        const vars = themeToCssVars(theme, mode);
        for (const key of COLOUR_KEYS) {
          if (HIGH_CONTRAST_EXEMPT.includes(key)) continue;
          const value = vars[key];
          expect(value, `${theme.id} ${mode} ${key} is not emitted`).toBeTruthy();
          for (const pattern of FORBIDDEN) {
            expect(value, `${theme.id} ${mode} ${key} = ${value}`).not.toMatch(pattern);
          }
        }
      });
    }
  }

  it('emits the overlay layer for every pack, so nothing has to mix its own', () => {
    // Before these existed, `MenuSheet` and `CommandMenu` each hand-rolled a
    // scrim. Two scrims is two chances for one of them to be the wrong black.
    for (const theme of THEMES) {
      for (const mode of ['dark', 'light'] as ThemeMode[]) {
        const vars = themeToCssVars(theme, mode);
        for (const key of ['--scrim', '--glass', '--hairline', '--shadow-color']) {
          expect(vars[key], `${theme.id} ${mode} ${key}`).toBeTruthy();
        }
      }
    }
  });

  it('keeps the shadow colour in step with the shadow it came from', () => {
    // Two fields that must agree is the price of not parsing a CSS shadow
    // string; this is what makes that price visible when somebody edits one.
    for (const theme of THEMES) {
      expect(theme.shape.shadow, theme.id).toContain(theme.shape.shadowColor);
    }
  });

  it('publishes one z-scale, identically, to every pack', () => {
    // Depth is shape, not palette. A pack that could renumber it would be a
    // pack whose sheet renders under the tab bar on one theme only.
    const Z = ['--z-scene', '--z-content', '--z-chrome', '--z-overlay', '--z-sheet', '--z-toast'];
    const first = themeToCssVars(THEMES[0]);
    for (const theme of THEMES) {
      const vars = themeToCssVars(theme);
      for (const key of Z) {
        expect(vars[key], `${theme.id} ${key}`).toBeTruthy();
        expect(vars[key], `${theme.id} ${key}`).toBe(first[key]);
      }
    }
    const value = (key: string) => Number.parseInt(first[key], 10);
    for (let i = 1; i < Z.length; i += 1) {
      expect(value(Z[i]), Z[i]).toBeGreaterThan(value(Z[i - 1]));
    }
  });
});

/**
 * The shared design language. Finch's shape is inherited by every pack; only
 * the palette and the radii are a pack's own. These pin that split, because the
 * failure mode is silent — a token that quietly stops being emitted does not
 * throw, it just makes one screen look slightly wrong on one theme.
 */
describe('the shared shape layer', () => {
  const SPACING = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7'];
  const TYPE = ['--text-xs', '--text-sm', '--text-base', '--text-lg', '--text-xl', '--text-2xl', '--text-3xl'];

  it('reaches every theme', () => {
    for (const theme of THEMES) {
      const vars = themeToCssVars(theme);
      for (const key of [...SPACING, ...TYPE, '--tap', '--ease-soft']) {
        expect(vars[key], `${theme.id} ${key}`).toBeTruthy();
      }
    }
  });

  it('is identical across every theme, because shape is not palette', () => {
    const first = themeToCssVars(THEMES[0]);
    for (const theme of THEMES.slice(1)) {
      const vars = themeToCssVars(theme);
      for (const key of [...SPACING, ...TYPE, '--tap']) {
        expect(vars[key], `${theme.id} ${key}`).toBe(first[key]);
      }
    }
  });

  it('rises monotonically through the spacing scale', () => {
    const px = (key: string) => Number.parseFloat(SHARED_TOKENS[key]);
    for (let i = 1; i < SPACING.length; i += 1) {
      expect(px(SPACING[i])).toBeGreaterThan(px(SPACING[i - 1]));
    }
  });

  it('never puts a meaningful size below 12px', () => {
    for (const key of TYPE) {
      const floor = Number.parseFloat(
        SHARED_TOKENS[key].startsWith('clamp(')
          ? SHARED_TOKENS[key].slice('clamp('.length)
          : SHARED_TOKENS[key],
      );
      expect(floor, key).toBeGreaterThanOrEqual(12);
    }
  });

  it('keeps the tap target above the 44px floor', () => {
    expect(Number.parseFloat(SHARED_TOKENS['--tap'])).toBeGreaterThanOrEqual(44);
  });

  /**
   * The shell publishes its own measurements so a screen can read how much room
   * it has. A page's content is measured against whatever the tab bar has left,
   * and the alternative — copying `82px` into a second file — drifts the first
   * time this changes and clips content under the bar on somebody's phone.
   */
  const LAYOUT = ['--shell-max', '--shell-gutter', '--shell-top', '--tabbar-h',
                  '--shell-bottom', '--shell-bottom-clear', '--stack'];

  it('publishes the shell measurements to every theme, identically', () => {
    const first = themeToCssVars(THEMES[0]);
    for (const theme of THEMES) {
      const vars = themeToCssVars(theme);
      for (const key of LAYOUT) {
        expect(vars[key], `${theme.id} ${key}`).toBeTruthy();
        expect(vars[key], `${theme.id} ${key}`).toBe(first[key]);
      }
    }
  });

  it('leaves more room at the bottom than the tab bar itself occupies', () => {
    // --shell-bottom-clear is a calc over --tabbar-h, so the guarantee is
    // structural rather than arithmetic: it cannot be smaller by construction.
    // The same shape as the retired --shell-left / --rail-width pair, turned a
    // quarter turn when the rail became a bar — see nav.ts.
    expect(SHARED_TOKENS['--shell-bottom-clear']).toContain('var(--tabbar-h)');
    // And the bar has to be at least a tap tall, or six tabs sit in a strip
    // too short to hit.
    expect(Number.parseFloat(SHARED_TOKENS['--tabbar-h'])).toBeGreaterThanOrEqual(
      Number.parseFloat(SHARED_TOKENS['--tap']),
    );
  });

  /** Radii are character, not inconsistency: sharp shinobi, round pony. */
  it('leaves each pack its own radius', () => {
    expect(SHARED_TOKENS['--radius']).toBeUndefined();
    const radii = THEMES.map((t) => t.shape.radius);
    expect(new Set(radii).size).toBeGreaterThan(1);
    for (const theme of THEMES) {
      expect(themeToCssVars(theme)['--radius'], theme.id).toBe(theme.shape.radius);
    }
  });
});
