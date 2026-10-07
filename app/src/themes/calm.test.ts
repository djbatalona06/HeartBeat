import { describe, expect, it } from 'vitest';
import { THEMES } from './index';
import { chroma, over } from './oklch';
import { contrast, variantOf } from './tokens';
import type { ThemeColors } from './types';

/**
 * The calm retune (docs/superpowers/specs/2026-10-07-calm-ui-foundation-design.md):
 * the ground a page is built on got quieter so the accent, which did not
 * change, stands out without getting louder.
 *
 * Measured as *painted* wherever that is what somebody sees; see DARK_BEFORE
 * for the one exception.
 */

type Ground = 'surface' | 'surfaceMuted' | 'border' | 'opaqueSurface';
const GROUND: Ground[] = ['surface', 'surfaceMuted', 'border', 'opaqueSurface'];

/**
 * Chroma of each dark ground colour before the retune. Surfaces are measured as
 * painted over the page; borders as written, because at ~22% alpha a painted
 * border is mostly the page under it, and the page did not change.
 */
const DARK_BEFORE: Record<string, Record<Ground, number>> = {
  avatar: { surface: 0.079, surfaceMuted: 0.08, border: 0.146, opaqueSurface: 0.078 },
  kitty: { surface: 0.06, surfaceMuted: 0.063, border: 0.139, opaqueSurface: 0.061 },
  pony: { surface: 0.064, surfaceMuted: 0.073, border: 0.103, opaqueSurface: 0.065 },
  shinobi: { surface: 0.119, surfaceMuted: 0.116, border: 0.171, opaqueSurface: 0.12 },
  sponge: { surface: 0.053, surfaceMuted: 0.054, border: 0.167, opaqueSurface: 0.053 },
};

/** Light grounds were already near grey; these keep them there. */
const LIGHT_CEILING: Record<Ground, number> = {
  surface: 0.02, opaqueSurface: 0.02, surfaceMuted: 0.04, border: 0.04,
};

function ground(colors: ThemeColors, opaqueSurface: string, key: Ground): string {
  return key === 'opaqueSurface' ? opaqueSurface : over(colors[key], colors.base);
}

describe('the calm ground', () => {
  for (const theme of THEMES) {
    for (const mode of ['dark', 'light'] as const) {
      const variant = variantOf(theme, mode);
      const { colors } = variant;
      const opaque = variant.opaqueSurface;

      describe(`${theme.name} (${mode})`, () => {
        it(mode === 'dark' ? 'is at least a fifth quieter than it was, hue kept' : 'stays near grey', () => {
          for (const key of GROUND) {
            const painted = chroma(ground(colors, opaque, key));
            if (mode === 'dark') {
              // 0.7× was applied to each colour; rounding to whole rgb steps and
              // painting over the page leave it under 0.8× of where it was.
              const measured = key === 'border' ? chroma(colors.border) : painted;
              expect(measured, key).toBeLessThanOrEqual(DARK_BEFORE[theme.id][key] * 0.8);
            } else {
              expect(painted, key).toBeLessThanOrEqual(LIGHT_CEILING[key]);
            }
          }
        });

        it('keeps body text at AA on every ground it sits on', () => {
          const surface = over(colors.surface, colors.base);
          const muted = over(colors.surfaceMuted, surface);
          for (const [name, bg] of [['base', colors.base], ['surface', surface], ['surfaceMuted', muted], ['opaqueSurface', opaque]]) {
            expect(contrast(colors.text, bg), name).toBeGreaterThanOrEqual(4.5);
          }
        });

        it('keeps muted text at AA large on the card', () => {
          // Muted text is only used at >=18px or bold: 3:1, as tokens.test.ts
          // holds for the hex tones. This one composites the rgba() ones too.
          const surface = over(colors.surface, colors.base);
          expect(contrast(over(colors.textMuted, surface), surface)).toBeGreaterThanOrEqual(3);
        });
      });
    }
  }
});
