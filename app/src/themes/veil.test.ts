import { describe, expect, it } from 'vitest';
import { THEMES } from './index';
import {
  GLASS_STRENGTH, SCRIM_STRENGTH, contrast, variantOf,
} from './tokens';
import type { ThemeMode } from './types';

/**
 * Can you read the home screen while the garden is moving behind it?
 *
 * ## Why this test has to exist
 *
 * Every other contrast check in this repo compares two colours that a designer
 * chose. This one compares text against a ground **nobody chose**: the garden
 * paints a sun, a pond, a tree line and six flowers across the whole viewport,
 * all of it in the theme's own tokens, all of it moving. At four in the
 * afternoon on a light palette the sun sits where a card is, and the honest
 * question is whether the words on top of it still clear AA.
 *
 * Screenshotting five themes in two modes at four times of day is twenty
 * pictures and an opinion. This is the same question as arithmetic.
 *
 * ## The model, and why it is deliberately pessimistic
 *
 * The garden draws every one of its shapes at some opacity below 1 — the sun
 * gradient tops out at 0.85, the stars at 0.5, the hills at 0.4. This test
 * ignores all of that and assumes **every paint lands at full strength**,
 * because the alternative is encoding a copy of the SVG's opacity table here
 * and keeping the two in step forever. A guard that is too strict fails when
 * the drawing changes; a guard that models the drawing fails silently when it
 * does. Take the strict one.
 *
 * So: for each theme and mode, for each colour the garden can paint, composite
 * the veil over it and check the text that sits on the result.
 *
 * ## What it found
 *
 * `--scrim` was set to 72% in Phase 0 for an unrelated reason — it was the
 * stronger of two hand-rolled scrims already in the stylesheet. It turns out to
 * be almost exactly the minimum that makes this pass: at 70% the binding case
 * (pony's muted text over a star, since the stars are painted in
 * `--color-text`) drops to 2.88 against a floor of 3.
 *
 * Read that margin with the pessimism above in mind. The real stars are 1.4px
 * circles at 0.5 opacity, so nothing on screen is anywhere near the case that
 * fails. But the number is not spare change, and lowering `SCRIM_STRENGTH`
 * because a screenshot looked a bit flat would land under the floor.
 */

/**
 * Every token `GardenBackdrop.tsx` and `GardenFlora.tsx` fill or stroke with.
 *
 * If a new paint appears in the garden that is not on this list, this test
 * keeps passing while the screen gets less legible — which is the one way it
 * can be wrong. The list is short on purpose, and the garden is meant to stay
 * inside the palette.
 */
const GARDEN_PAINTS = [
  'base', 'accent', 'surface', 'surfaceMuted', 'text', 'textMuted',
] as const;

const MODES: ThemeMode[] = ['dark', 'light'];

interface Rgba { r: number; g: number; b: number; a: number }

/** `#rgb`, `#rrggbb`, `rgb(…)` and `rgba(…)` — every shape the palettes use. */
function parse(css: string): Rgba {
  const value = css.trim();

  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) {
    const [r, g, b] = [...short[1]].map((ch) => parseInt(ch + ch, 16));
    return { r, g, b, a: 1 };
  }

  const long = /^#([0-9a-f]{6})$/i.exec(value);
  if (long) {
    const int = parseInt(long[1], 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255, a: 1 };
  }

  const fn = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
    }
  }

  throw new Error(`veil.test cannot parse the colour ${css}`);
}

function hex({ r, g, b }: Rgba): string {
  const byte = (n: number) => Math.round(Math.min(255, Math.max(0, n)))
    .toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/**
 * Source-over: `fg` painted on top of an opaque `bg`.
 *
 * `bg` is always opaque here because everything bottoms out on `--color-base`,
 * which `tokens.test.ts` already requires to be a solid colour — so the result
 * is opaque too and can go straight into `contrast`.
 */
function over(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/** The same colour with its alpha scaled, which is what `color-mix(… N%, transparent)` is. */
function fade(colour: Rgba, percent: number): Rgba {
  return { ...colour, a: colour.a * (percent / 100) };
}

describe('the veil over the home garden', () => {
  for (const theme of THEMES) {
    for (const mode of MODES) {
      const { colors } = variantOf(theme, mode);
      const base = parse(colors.base);
      const label = `${theme.id} ${mode}`;

      // What the garden can put behind a word, flattened onto the page's own
      // background the way the browser will flatten it.
      const grounds = GARDEN_PAINTS.map((token) => ({
        token,
        colour: over(parse(colors[token]), base),
      }));

      /** Text on a ground, with the text's own alpha honoured. */
      const readAgainst = (ink: string, ground: Rgba) =>
        contrast(hex(over(parse(ink), ground)), hex(ground));

      it(`${label}: a scrim keeps body text over any garden paint at AA`, () => {
        for (const { token, colour } of grounds) {
          const veiled = over(fade(base, SCRIM_STRENGTH), colour);
          expect(
            readAgainst(colors.text, veiled),
            `${label}: text over scrimmed ${token}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`${label}: a scrim keeps muted text over any garden paint at AA large`, () => {
        for (const { token, colour } of grounds) {
          const veiled = over(fade(base, SCRIM_STRENGTH), colour);
          expect(
            readAgainst(colors.textMuted, veiled),
            `${label}: muted text over scrimmed ${token}`,
          ).toBeGreaterThanOrEqual(3);
        }
      });

      it(`${label}: a glass card keeps body text over any garden paint at AA`, () => {
        const surface = parse(colors.surface);
        for (const { token, colour } of grounds) {
          const card = over(fade(surface, GLASS_STRENGTH), colour);
          expect(
            readAgainst(colors.text, card),
            `${label}: text on a glass card over ${token}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  /**
   * The design rationale, kept honest.
   *
   * The five pack backdrops already paint behind text on every other screen,
   * and the loudest of them — kitty's light bows — lands at 0.3 alpha. That is
   * the ceiling this app has already shipped and read on real phones, so the
   * garden under its scrim is held to the same one rather than to a number
   * somebody liked the look of.
   */
  it('lets no more garden through than a pack backdrop already shows', () => {
    const LOUDEST_PACK_INK_PERCENT = 30;
    // Compared in whole percent rather than as fractions: `1 - 0.7` is
    // 0.30000000000000004, and a guard that fails on a float's last bit
    // teaches the next person to weaken it.
    expect(100 - SCRIM_STRENGTH).toBeLessThanOrEqual(LOUDEST_PACK_INK_PERCENT);
  });
});
