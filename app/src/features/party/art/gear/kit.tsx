import type { ReactNode } from 'react';

/**
 * The shared parts of the richer drawings.
 *
 * Every drawing is still painted in the theme's own tokens, so it re-themes
 * with the pack and the mode: `--color-text` for the body, `--color-accent` for
 * the one warm part, `--color-text-muted` for secondary parts, `--color-base`
 * for a light edge that contrasts with either, and `--shadow-color` (which the
 * theme engine emits corrected for the mode) for shade and outline. Nothing
 * here names a palette colour. The toon light from `ToonDefs` is applied by the
 * `.gear-art` class on top of all of it.
 *
 * What the kit adds to the old flat drawings is only what makes them read as
 * objects rather than symbols: a soft outline, a darker face on one side of a
 * shape, and a glint.
 */

export const text = 'var(--color-text)';
export const accent = 'var(--color-accent)';
export const muted = 'var(--color-text-muted)';
export const base = 'var(--color-base)';
export const shadow = 'var(--shadow-color)';

/** A soft outline in the shadow colour. Spread onto a shape. */
export const EDGE = {
  stroke: shadow,
  strokeWidth: 1.6,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
  strokeOpacity: 0.55,
} as const;

/** The darker face of a shape: a copy of it, filled with this, drawn on top. */
export const SHADE = { fill: shadow, opacity: 0.26 } as const;

/** A short bright stroke where the light catches an edge. */
export const GLINT = {
  stroke: base,
  strokeWidth: 2,
  strokeLinecap: 'round',
  fill: 'none',
  opacity: 0.55,
} as const;

export const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">{children}</svg>
);

/** A four-pointed star, concave between the points. */
export function Star({ cx, cy, r, fill = accent }: { cx: number; cy: number; r: number; fill?: string }) {
  const k = r * 0.28;
  const d = `M${cx} ${cy - r} L${cx + k} ${cy - k} L${cx + r} ${cy} L${cx + k} ${cy + k} `
    + `L${cx} ${cy + r} L${cx - k} ${cy + k} L${cx - r} ${cy} L${cx - k} ${cy - k} Z`;
  return <path d={d} fill={fill} {...EDGE} strokeWidth={1} />;
}
