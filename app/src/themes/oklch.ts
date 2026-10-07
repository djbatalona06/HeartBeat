/**
 * Just enough colour science to say how colourful a ground colour looks.
 *
 * OKLCH's chroma is "how far from grey", measured so that equal steps look
 * equal, which HSL saturation is not: `#fbf7ff` is nearly white and still reads
 * as 100% saturated in HSL. Used by `calm.test.ts`; nothing at runtime needs it.
 */

export type Rgba = [number, number, number, number];

/** `#rrggbb` or `rgba(r, g, b, a)` / `rgb(r, g, b)`, as the packs write them. */
export function parseColour(value: string): Rgba {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(v);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(v);
  if (!fn) throw new Error(`not a colour the packs write: ${value}`);
  const [r, g, b, a = 1] = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [r, g, b, a];
}

/** What `colour` paints over an opaque `ground`, as an opaque `#rrggbb`. */
export function over(colour: string, ground: string): string {
  const [r, g, b, a] = parseColour(colour);
  const [gr, gg, gb] = parseColour(ground);
  const mix = (top: number, bottom: number) => Math.round(top * a + bottom * (1 - a));
  return `#${[mix(r, gr), mix(g, gg), mix(b, gb)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** OKLCH chroma of a colour's own rgb; alpha is ignored (paint it with `over` first to measure what shows). */
export function chroma(colour: string): number {
  const [r, g, b] = parseColour(colour).map((c, i) => {
    if (i === 3) return c;
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.hypot(A, B);
}
