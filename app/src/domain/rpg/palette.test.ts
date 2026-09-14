import { describe, expect, it } from 'vitest';
import { luminanceOf, mix, paletteFrom } from './palette';
import { contrast, luminance } from '../../themes/tokens';
import { THEMES } from '../../themes';

const HEX = /^#[0-9a-f]{6}$/i;

describe('mix', () => {
  it('returns the first colour at amount 0 and the second at amount 1', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('is always a six-digit opaque hex, never rgba', () => {
    for (const t of [-1, 0, 0.25, 0.5, 0.75, 1, 2]) {
      expect(mix('#2a0f1c', '#ff8fb0', t)).toMatch(HEX);
    }
  });

  it('clamps an amount outside [0, 1] rather than throwing', () => {
    expect(() => mix('#000000', '#ffffff', -5)).not.toThrow();
    expect(() => mix('#000000', '#ffffff', 5)).not.toThrow();
    expect(mix('#000000', '#ffffff', -5)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 5)).toBe('#ffffff');
  });

  it('falls back rather than throwing on a malformed colour', () => {
    expect(() => mix('not-a-colour', '#ffffff', 0.5)).not.toThrow();
    expect(mix('not-a-colour', '#ffffff', 0.5)).toMatch(HEX);
  });
});

describe('luminanceOf', () => {
  it('agrees with the shared luminance() for a real hex', () => {
    expect(luminanceOf('#2a0f1c')).toBeCloseTo(luminance('#2a0f1c'), 10);
  });

  it('is total for a malformed colour', () => {
    expect(() => luminanceOf('nonsense')).not.toThrow();
    expect(luminanceOf('nonsense')).toBe(0.5);
  });
});

describe('paletteFrom', () => {
  it('is always opaque — the defect this module exists to fix', () => {
    // The old mapping read --color-surface (alpha 0.92) and --color-border
    // (alpha 0.22) straight onto a `transparent: true` canvas. Nothing here may
    // ever produce anything but a solid six-digit hex.
    const palette = paletteFrom('#2a0f1c', '#ff8fb0');
    for (const value of Object.values(palette)) expect(value).toMatch(HEX);
  });

  it('passes the accent straight through — this is what keeps dyes working', () => {
    expect(paletteFrom('#2a0f1c', '#c8b6ff').accent).toBe('#c8b6ff');
    expect(paletteFrom('#fff5f8', '#c8b6ff').accent).toBe('#c8b6ff');
  });

  it('makes outline the strongest contrast against mid, in both directions', () => {
    const dark = paletteFrom('#2a0f1c', '#ff8fb0');
    const light = paletteFrom('#fff5f8', '#ff8fb0');
    // 2:1 is a soft floor — the old mapping's text-vs-surface pair sometimes
    // cleared much less than this once alpha over a dark backdrop was accounted
    // for, which is the failure this test exists to catch.
    expect(contrast(dark.outline, dark.mid)).toBeGreaterThanOrEqual(2);
    expect(contrast(light.outline, light.mid)).toBeGreaterThanOrEqual(2);
  });

  it('keeps light lighter than mid in dark mode, and mid lighter than light in light mode', () => {
    // Both are "lighter than base, closer to base than outline" — the ordering
    // that broke before. In dark mode the ink direction is white, so more ink
    // means MORE luminance; in light mode the ink direction is black, so more
    // ink means LESS luminance. "light" always mixes in less ink than "mid".
    const dark = paletteFrom('#2a0f1c', '#ff8fb0');
    expect(luminance(dark.light)).toBeGreaterThan(luminance(dark.mid));

    const light = paletteFrom('#fff5f8', '#ff8fb0');
    expect(luminance(light.light)).toBeGreaterThan(luminance(light.mid));
  });

  it('keeps every fill role between base and outline, never overshooting', () => {
    const base = '#2a0f1c';
    const palette = paletteFrom(base, '#ff8fb0');
    const baseLum = luminance(base);
    const outlineLum = luminance(palette.outline);
    for (const role of ['mid', 'light'] as const) {
      const lum = luminance(palette[role]);
      expect(lum).toBeGreaterThanOrEqual(Math.min(baseLum, outlineLum) - 1e-9);
      expect(lum).toBeLessThanOrEqual(Math.max(baseLum, outlineLum) + 1e-9);
    }
  });

  it('is total for a malformed base or accent', () => {
    expect(() => paletteFrom('nonsense', 'also nonsense')).not.toThrow();
    const palette = paletteFrom('nonsense', 'also nonsense');
    for (const value of Object.values(palette)) expect(value).toMatch(HEX);
  });

  // The test that would have caught the original bug before a browser did:
  // run the derivation over every real theme variant and insist no pack
  // produces a role too close to its neighbour to read as a different tile.
  describe('stays legible on every real theme variant', () => {
    for (const theme of THEMES) {
      for (const [mode, colors] of [['dark', theme.colors], ['light', theme.light.colors]] as const) {
        it(`${theme.id} (${mode})`, () => {
          const palette = paletteFrom(colors.base, colors.accent);
          expect(contrast(palette.outline, palette.mid), 'outline vs mid').toBeGreaterThanOrEqual(2);
          expect(contrast(palette.outline, palette.light), 'outline vs light').toBeGreaterThanOrEqual(1.4);
          expect(contrast(palette.light, palette.mid), 'light vs mid').toBeGreaterThanOrEqual(1.1);
          // A large flat fill against the page background should still read as
          // a tile and not vanish into the backdrop behind a transparent canvas.
          expect(contrast(palette.mid, colors.base), 'mid vs page base').toBeGreaterThanOrEqual(1.1);
        });
      }
    }
  });
});
