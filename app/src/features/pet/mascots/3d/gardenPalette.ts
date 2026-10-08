/**
 * How the home garden's tree is painted from the theme in front of it.
 *
 * Pure arithmetic on sRGB triples, so it can be tested without a GPU or a DOM —
 * `gardenScene.ts` reads the tokens, hands them here, and paints the answer.
 *
 * Every role is a blend of tokens the pack already owns, never a new hue: the
 * pack's accent is the foliage, so kitty's tree is pink, shinobi's is rust and
 * pony's is lilac without anyone writing five trees. That is the same rule the
 * rest of the app follows for the mood lean (`--color-accent-live`).
 */
export type Rgb = [number, number, number];

export interface Tokens {
  base: Rgb;
  text: Rgb;
  accent: Rgb;
  success: Rgb;
  danger: Rgb;
}

export const ROLES = ['leaf', 'leafAlt', 'bloom', 'trunk', 'rock', 'ground'] as const;
export type Role = (typeof ROLES)[number];

export interface GardenPaint {
  colors: Record<Role, Rgb>;
  /** Sky light over the tree, and the bounce from the ground back up. */
  sky: Rgb;
  bounce: Rgb;
  /** Strength of the two lights. A dark page gets a dimmer garden. */
  ambient: number;
  sun: number;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Relative luminance, per WCAG, on 0–1 sRGB channels. */
export function luma([r, g, b]: Rgb): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function gardenPaint(t: Tokens): GardenPaint {
  const dark = luma(t.base) < 0.35;
  // `base` and `text` swap roles between the two palettes; ink and paper do not.
  const [ink, paper] = luma(t.base) < luma(t.text) ? [t.base, t.text] : [t.text, t.base];

  return {
    colors: {
      leaf: t.accent,
      leafAlt: mix(t.accent, t.danger, 0.4),
      bloom: mix(t.accent, paper, 0.45),
      trunk: mix(ink, t.accent, 0.22),
      rock: mix(mix(ink, paper, 0.4), t.success, 0.25),
      ground: mix(t.base, t.accent, dark ? 0.16 : 0.24),
    },
    sky: mix(paper, t.accent, 0.2),
    bounce: mix(ink, t.accent, 0.3),
    ambient: dark ? 1.9 : 2.5,
    sun: dark ? 1.9 : 2.1,
  };
}
