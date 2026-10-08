import { describe, expect, it } from 'vitest';
import { THEMES } from '../../../../themes';
import { ARENA_ROLES, arenaPaint } from './arenaPalette';
import { luma, type Rgb, type Tokens } from './gardenPalette';

function hex(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function tokensOf(colors: { base: string; text: string; accent: string; success: string; danger: string }): Tokens {
  return {
    base: hex(colors.base), text: hex(colors.text), accent: hex(colors.accent),
    success: hex(colors.success), danger: hex(colors.danger),
  };
}

const packs = THEMES.flatMap((theme) => [
  { id: `${theme.id} dark`, colors: theme.colors },
  { id: `${theme.id} light`, colors: theme.light.colors },
]);

describe('the arena paint', () => {
  it('paints every role the file names, with channels in range, for every pack in both palettes', () => {
    for (const { id, colors } of packs) {
      const paint = arenaPaint(tokensOf(colors));
      for (const role of ARENA_ROLES) {
        for (const v of paint.colors[role]) {
          expect(v, `${id} ${role}`).toBeGreaterThanOrEqual(0);
          expect(v, `${id} ${role}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  /** If the two squares matched it would be a plain floor, and the board would lose its pattern. */
  it('keeps the two squares visibly different in every pack and palette', () => {
    for (const { id, colors } of packs) {
      const { colors: c } = arenaPaint(tokensOf(colors));
      const [a, b] = [luma(c.tileA), luma(c.tileB)];
      expect(Math.abs(a - b) / Math.max(a, b, 0.01), id).toBeGreaterThan(0.04);
    }
  });

  it('lights a light page at least as brightly as a dark one', () => {
    for (const theme of THEMES) {
      const dark = arenaPaint(tokensOf(theme.colors));
      const light = arenaPaint(tokensOf(theme.light.colors));
      expect(light.ambient, theme.id).toBeGreaterThanOrEqual(dark.ambient);
    }
  });
});
