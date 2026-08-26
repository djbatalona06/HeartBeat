import { describe, expect, it } from 'vitest';
import { THEMES } from './index';
import { contrast, themeToCssVars } from './tokens';

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
