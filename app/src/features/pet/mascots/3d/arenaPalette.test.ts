import { describe, expect, it } from 'vitest';
import { THEMES } from '../../../../themes';
import { ARENA_ROLES, PIECE_ROLES, arenaPaint } from './arenaPalette';
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

  it('keeps the tactile highlight and shadow inside the theme-derived RGB range', () => {
    for (const { id, colors } of packs) {
      const paint = arenaPaint(tokensOf(colors));
      for (const tone of [paint.highlight, paint.shadow]) {
        for (const channel of tone) {
          expect(channel, id).toBeGreaterThanOrEqual(0);
          expect(channel, id).toBeLessThanOrEqual(1);
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

  it('paints every raised piece with channels in range, for every pack in both palettes', () => {
    for (const { id, colors } of packs) {
      const { pieces } = arenaPaint(tokensOf(colors));
      for (const role of PIECE_ROLES) {
        for (const v of pieces[role]) {
          expect(v, `${id} ${role}`).toBeGreaterThanOrEqual(0);
          expect(v, `${id} ${role}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  /**
   * A hedge the colour of the floor is a floor. Distance in sRGB is crude, but
   * it is the same crude measure for every pack, and it catches a role that
   * collapses onto the ground.
   */
  it('keeps every raised piece apart from both floor squares in every pack and palette', () => {
    const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (const { id, colors } of packs) {
      const { colors: floor, pieces } = arenaPaint(tokensOf(colors));
      for (const role of PIECE_ROLES) {
        for (const square of [floor.tileA, floor.tileB]) {
          expect(dist(pieces[role], square), `${id} ${role}`).toBeGreaterThan(0.06);
        }
      }
    }
  });

  /** The board the player already knows must not move when pieces arrive: pinned to the shipped formulas. */
  it('leaves the three floor colours exactly as they were', () => {
    const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const mixed = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;
    for (const { id, colors } of packs) {
      const t = tokensOf(colors);
      const dark = luma(t.base) < 0.35;
      const [ink, paper] = luma(t.base) < luma(t.text) ? [t.base, t.text] : [t.text, t.base];
      const floor = mixed(t.base, t.accent, dark ? 0.2 : 0.3);
      const { colors: c } = arenaPaint(t);
      expect(dist(c.tileA, floor), id).toBeLessThan(1e-9);
      expect(dist(c.tileB, mixed(floor, dark ? paper : ink, dark ? 0.14 : 0.16)), id).toBeLessThan(1e-9);
      expect(dist(c.grout, mixed(ink, t.accent, 0.18)), id).toBeLessThan(1e-9);
    }
  });
});
