import { luminance } from '../../themes/tokens';

/**
 * The four sprite roles, derived from the two theme tokens that never invert.
 *
 * `bake.ts` used to read `--color-text`, `--color-text-muted`, `--color-surface`
 * and `--color-accent` straight off the host and assign them to `outline`,
 * `mid`, `light` and `accent` respectively. That looked reasonable and was
 * backwards: `--color-text` and `--color-surface` **swap which one is lighter**
 * between a pack's dark and light variant, because the app itself always wants
 * light ink on a dark surface or the reverse. A sprite role named `light` is a
 * promise about ordering — "lighter than `mid`" — and the app's own tokens do
 * not keep that promise in both modes. On kitty's default (dark) variant the
 * garden's path rendered darker than its grass and the pond rendered as a solid
 * accent barcode; on the light variant the same sprites were fine, which is
 * exactly the signature of a role reading the wrong end of an inverting pair.
 *
 * The fix is to stop asking four tokens to hold an ordering and derive that
 * ordering from two that are solid and stable in every pack: `base` (a page
 * background, `#rrggbb` in all ten pack variants) and `accent` (the one token
 * that already passes through unchanged — this is what keeps a purchased dye
 * recolouring the garden, since `dyeStyle()` sets `--color-accent`). Every role
 * below is `base` blended toward whichever of white or black actually contrasts
 * with it, at an increasing distance, so `outline` is always the strongest line,
 * `light` is always lighter than `mid`, and both hold in every pack without a
 * pack ever needing to know the overworld exists.
 */

/**
 * The two poles of the blend, not colours anything is painted.
 *
 * `paletteFrom` below only ever mixes *toward* one of these, and never past
 * 0.85, so no sprite is ever pure white or pure black. They are the ends of a
 * number line rather than design tokens, which is why the no-pure-black rule in
 * `themes/tokens.test.ts` does not reach them: that rule asks what a theme
 * *emits*, and these are never emitted.
 */
const WHITE = '#ffffff';
const BLACK = '#000000';

/** A safe fallback if a theme ever ships a malformed token — never thrown. */
const FALLBACK_BASE = '#2a0f1c';
const FALLBACK_ACCENT = '#ff8fb0';

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex(channels: readonly [number, number, number]): string {
  return `#${channels.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Blend two solid colours. `amount` 0 returns `a`, 1 returns `b`. Always
 * opaque — nothing here ever produces an `rgba()`, which is what let the old
 * mapping paint half-transparent pixels onto a `transparent: true` canvas.
 * Malformed input falls back rather than throwing, the `findAt`/`placeById`
 * convention: a bad theme token should cost a wrong colour, not a crash.
 */
export function mix(a: string, b: string, amount: number): string {
  const from = parseHex(a) ?? parseHex(FALLBACK_BASE)!;
  const to = parseHex(b) ?? parseHex(FALLBACK_BASE)!;
  const t = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  const blended = from.map((c, i) => c + (to[i] - c) * t) as [number, number, number];
  return toHex(blended);
}

/** 0 (black) to 1 (white). Total: a bad hex reads as mid-grey rather than throwing. */
export function luminanceOf(hex: string): number {
  const parsed = parseHex(hex);
  if (!parsed) return 0.5;
  try {
    return luminance(toHex(parsed));
  } catch {
    return 0.5;
  }
}

export interface SpritePalette {
  outline: string;
  mid: string;
  light: string;
  accent: string;
}

/**
 * The four roles, from a page background and an accent — both solid in every
 * theme pack. Picks white or black as the ink direction from `base`'s own
 * luminance, so it needs no per-pack table and no mode flag from the caller.
 */
export function paletteFrom(base: string, accent: string): SpritePalette {
  const safeBase = parseHex(base) ? base : FALLBACK_BASE;
  const safeAccent = parseHex(accent) ? accent : FALLBACK_ACCENT;
  const ink = luminanceOf(safeBase) < 0.5 ? WHITE : BLACK;
  return {
    // Strongest line against the background — this is what "outline" means.
    outline: mix(safeBase, ink, 0.85),
    // The lighter of the two fills, closer to `base` than `mid` is.
    light: mix(safeBase, ink, ink === WHITE ? 0.55 : 0.12),
    // The dimmer fill, further from `base` than `light` in the ink direction.
    mid: mix(safeBase, ink, ink === WHITE ? 0.3 : 0.28),
    accent: safeAccent,
  };
}
