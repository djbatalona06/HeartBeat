import { describe, expect, it } from 'vitest';
import { THEMES } from '../../../../themes';
import { gardenPaint, luma, mix, ROLES, type Rgb, type Tokens } from './gardenPalette';

function hex(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The real tokens of a real pack, as the renderer would read them. */
function tokensOf(colors: { base: string; text: string; accent: string; success: string; danger: string }): Tokens {
  return {
    base: hex(colors.base), text: hex(colors.text), accent: hex(colors.accent),
    success: hex(colors.success), danger: hex(colors.danger),
  };
}

describe('the garden paint', () => {
  it('paints every role the file names, for every pack in both palettes', () => {
    for (const theme of THEMES) {
      for (const colors of [theme.colors, theme.light.colors]) {
        const paint = gardenPaint(tokensOf(colors));
        for (const role of ROLES) {
          const [r, g, b] = paint.colors[role];
          for (const v of [r, g, b]) {
            expect(v, `${theme.id} ${role}`).toBeGreaterThanOrEqual(0);
            expect(v, `${theme.id} ${role}`).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('keeps the foliage the pack\'s own accent', () => {
    for (const theme of THEMES) {
      const t = tokensOf(theme.colors);
      expect(gardenPaint(t).colors.leaf).toEqual(t.accent);
    }
  });

  it('keeps the trunk darker than the foliage in every pack and palette', () => {
    for (const theme of THEMES) {
      for (const colors of [theme.colors, theme.light.colors]) {
        const { colors: c } = gardenPaint(tokensOf(colors));
        expect(luma(c.trunk), theme.id).toBeLessThan(luma(c.leaf));
      }
    }
  });

  it('lights a light page at least as brightly as a dark one', () => {
    const kitty = THEMES.find((t) => t.id === 'kitty')!;
    expect(gardenPaint(tokensOf(kitty.light.colors)).ambient)
      .toBeGreaterThanOrEqual(gardenPaint(tokensOf(kitty.colors)).ambient);
  });

  it('mixes linearly', () => {
    expect(mix([0, 0, 0], [1, 1, 1], 0.25)).toEqual([0.25, 0.25, 0.25]);
  });
});
