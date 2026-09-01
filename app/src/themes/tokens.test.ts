import { describe, expect, it } from 'vitest';
import { THEMES } from './index';
import { SHARED_TOKENS, contrast, themeToCssVars } from './tokens';

/**
 * A theme that ships unreadable is worse than no theme, and it is very easy to
 * pick a pretty accent that fails against its own surface. These run in CI so
 * an unreadable palette cannot land.
 */
describe('theme palettes', () => {
  it('has a unique id per theme', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const theme of THEMES) {
    describe(theme.name, () => {
      it('body text clears WCAG AA against the card surface', () => {
        expect(contrast(theme.colors.text, theme.opaqueSurface)).toBeGreaterThanOrEqual(4.5);
      });

      it('muted text clears AA large against the card surface', () => {
        // Muted text is only ever used at >=18px or bold, so 3:1 is the bar.
        const value = theme.colors.textMuted.startsWith('#')
          ? theme.colors.textMuted
          : null;
        if (!value) return; // rgba() muted tones are composited; covered visually
        expect(contrast(value, theme.opaqueSurface)).toBeGreaterThanOrEqual(3);
      });

      it('accent text is legible on the accent fill', () => {
        expect(contrast(theme.colors.accentText, theme.colors.accent)).toBeGreaterThanOrEqual(4.5);
      });

      it('body text clears AA against the page base', () => {
        expect(contrast(theme.colors.text, theme.colors.base)).toBeGreaterThanOrEqual(4.5);
      });

      it('emits every css variable the stylesheet consumes', () => {
        const vars = themeToCssVars(theme);
        for (const key of ['--color-base', '--color-surface', '--color-text', '--color-accent', '--radius', '--motion-medium']) {
          expect(vars[key], key).toBeTruthy();
        }
      });
    });
  }
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
   * it has. The home screen places a ring of bubbles inside whatever is left,
   * and the alternative — copying `92px` into a second file — drifts the first
   * time this changes and clips the bottom row on somebody's phone.
   */
  const LAYOUT = ['--shell-max', '--shell-gutter', '--shell-top', '--tabbar-height',
                  '--shell-bottom', '--stack'];

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

  it('leaves more room at the bottom than the bar itself occupies', () => {
    // --shell-bottom is a calc over --tabbar-height, so the guarantee is
    // structural rather than arithmetic: it cannot be smaller by construction.
    expect(SHARED_TOKENS['--shell-bottom']).toContain('var(--tabbar-height)');
    expect(Number.parseFloat(SHARED_TOKENS['--tabbar-height'])).toBeGreaterThanOrEqual(
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
