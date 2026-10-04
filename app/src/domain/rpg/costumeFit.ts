import type { CostumeSlot } from './costumes';

/**
 * Fitting a costume to a mascot.
 *
 * Every costume is drawn once, in the 100x100 box and at the proportions of the
 * Mochi drawing: head top at y21, head centre x50, neck near y68. The five
 * mascots are not Mochi. Wishbell's head starts at y33, so a hat drawn for y21
 * floats a dozen units above it; Marigold is a sponge with no head at all. So a
 * costume is not redrawn per mascot -- it is moved and scaled by one affine
 * map, anchored where that slot lands on that mascot.
 *
 *     p' = at + s * (p - ref)
 *
 * `ref` is the point on the reference drawing, `at` is where it lands. The
 * anchors below are measured off the mascot SVGs in `features/pet/mascots/`
 * (`costumeFit.test.ts` carries the same measurements and holds the table to
 * them), and the scale is what keeps the tallest hat inside the 100x100 box on
 * the mascots whose heads start high or low.
 *
 * Pure, and it returns a CSS transform rather than editing the drawings, so
 * none of the fifteen costume components knows mascots differ.
 */

export interface Anchor {
  /** Where the reference point lands. */
  x: number;
  y: number;
  /** Uniform scale about it. */
  s: number;
}

export interface Fit {
  head: Anchor;
  /** Neck and back items share one: a cape hangs from the same place a scarf wraps. */
  neck: Anchor;
}

/** The reference points on the Mochi drawing every costume was drawn against. */
export const REFERENCE: Record<'head' | 'neck', { x: number; y: number }> = {
  head: { x: 50, y: 21 },
  neck: { x: 50, y: 68 },
};

export const FIT: Record<string, Fit> = {
  // Mochi: the drawing the costumes were made on.
  kitty: { head: { x: 50, y: 21, s: 1 }, neck: { x: 50, y: 68, s: 1 } },
  // Marigold has no head, so hats sit on the top of the body, sunk a little and
  // shrunk to fit under the box's edge; there is no neck, so scarves go on the
  // lower body.
  sponge: { head: { x: 50, y: 20, s: 0.8 }, neck: { x: 50, y: 70, s: 0.9 } },
  // Foxglove's head is centred four units right of the box.
  shinobi: { head: { x: 54, y: 22, s: 0.92 }, neck: { x: 54, y: 66, s: 0.92 } },
  // Cirrus has a smaller head, high in the box.
  avatar: { head: { x: 50, y: 19, s: 0.85 }, neck: { x: 50, y: 59, s: 0.85 } },
  // Wishbell's head sits low; the horn rises through whatever is worn.
  pony: { head: { x: 50, y: 33, s: 0.85 }, neck: { x: 50, y: 74, s: 0.85 } },
};

/** Unknown theme ids fall back the way `getMascot` does: to the reference. */
export function fitFor(mascotId: string | undefined): Fit {
  return (mascotId && FIT[mascotId]) || FIT.kitty;
}

/**
 * The extent each slot's drawings cover on the reference, taken from the
 * widest and tallest of the garments in it. The test maps these through the fit
 * and requires them to stay inside the box.
 */
export const SLOT_EXTENT: Record<CostumeSlot, { x0: number; y0: number; x1: number; y1: number }> = {
  head: { x0: 17, y0: 0, x1: 83, y1: 60 },
  neck: { x0: 26, y0: 62, x1: 74, y1: 97 },
  back: { x0: 6, y0: 44, x1: 94, y1: 96 },
};

/** Which anchor a slot uses, and the reference point it is measured from. */
export function anchorFor(slot: CostumeSlot, mascotId: string | undefined) {
  const fit = fitFor(mascotId);
  return slot === 'head'
    ? { anchor: fit.head, ref: REFERENCE.head }
    : { anchor: fit.neck, ref: REFERENCE.neck };
}

/** Where a reference-space point lands for this slot on this mascot. */
export function place(
  slot: CostumeSlot,
  mascotId: string | undefined,
  p: { x: number; y: number },
): { x: number; y: number } {
  const { anchor, ref } = anchorFor(slot, mascotId);
  return { x: anchor.x + anchor.s * (p.x - ref.x), y: anchor.y + anchor.s * (p.y - ref.y) };
}

/**
 * The same map as CSS, for a layer that is a 100x100 box: scale about the
 * box's top-left, then translate so `ref` lands on `at`. Percentages are of the
 * box, which is 100 units, so the numbers carry over unchanged. Nothing for the
 * reference itself, so Mochi renders exactly as it did before fitting existed.
 */
export function fitStyle(slot: CostumeSlot, mascotId: string | undefined): Record<string, string> {
  const { anchor, ref } = anchorFor(slot, mascotId);
  if (anchor.s === 1 && anchor.x === ref.x && anchor.y === ref.y) return {};
  const tx = anchor.x - anchor.s * ref.x;
  const ty = anchor.y - anchor.s * ref.y;
  return {
    transformOrigin: '0 0',
    transform: `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) scale(${anchor.s})`,
  };
}
