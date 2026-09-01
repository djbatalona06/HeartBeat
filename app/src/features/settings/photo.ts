/**
 * The size budget for a face.
 *
 * A photo picked on a modern phone is three to eight megabytes. That is not a
 * thumbnail; it is a row that would be copied into the other phone's database,
 * pushed through a D1 statement, and held in memory by every live query that
 * touches members. So the picture is cropped square, shrunk to 256px and
 * re-encoded down a quality ladder until it fits in 64 KB — which is a face at
 * arm's length on a phone, and nothing more, because nothing more is wanted.
 *
 * The maths lives here rather than in the picker so it can be tested: the
 * canvas work is four lines, and the part that is easy to get wrong is the
 * crop rectangle and the budget.
 */

/** The stored edge, in device-independent pixels. Rendered at 64px, so this
    still has room to be sharp on a 3x screen. */
export const PHOTO_MAX_PX = 256;

/**
 * The ceiling on the stored data URI, in bytes.
 *
 * It is measured on the string, not on the decoded image, because the string
 * is what the row actually costs in IndexedDB, in the JSON body, and in D1.
 */
export const PHOTO_BUDGET_BYTES = 64 * 1024;

/**
 * JPEG qualities to try, in order. It stops at the first one that fits, so a
 * small picture keeps the good encode and only a stubborn one walks down.
 */
export const QUALITY_LADDER = [0.82, 0.7, 0.58, 0.45, 0.35] as const;

export interface CoverBox {
  /** Source rectangle: a centred square, in the original's own pixels. */
  sx: number;
  sy: number;
  edge: number;
  /** The square it is drawn into. Never larger than the source. */
  target: number;
}

/**
 * The centre square of an image, and how big to draw it.
 *
 * Centred rather than top-aligned: people frame themselves in the middle, and
 * a top crop on a landscape photo is a picture of a wall.
 */
export function coverBox(width: number, height: number, max = PHOTO_MAX_PX): CoverBox {
  const edge = Math.max(1, Math.min(width, height));
  return {
    // Clamped at zero: a degenerate size makes `edge` larger than the image, and
    // a negative offset asks drawImage to sample from outside it.
    sx: Math.max(0, Math.floor((width - edge) / 2)),
    sy: Math.max(0, Math.floor((height - edge) / 2)),
    edge,
    // Never upscaled — enlarging a small photo costs bytes and adds nothing.
    target: Math.max(1, Math.min(max, edge)),
  };
}

/** ASCII in, so the character count is the byte count. */
export function photoBytes(dataUri: string): number {
  return dataUri.length;
}

export function withinBudget(dataUri: string): boolean {
  return photoBytes(dataUri) <= PHOTO_BUDGET_BYTES;
}

/** A data URI that is actually an image, rather than any other thing. */
export function isImageDataUri(value: string): boolean {
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/** For the line under the photo. Rounded to whole KB; nobody wants decimals. */
export function formatKb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
