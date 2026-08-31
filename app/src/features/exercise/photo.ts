import type { WorkoutPhoto } from '../../domain/types';

/**
 * The arithmetic behind shrinking a phone photograph down to something a phone
 * can hold and, later, put on a wire.
 *
 * Everything here is pure on purpose. There is no `document`, no `Image` and no
 * canvas in this file — the drawing lives in CameraCapture.tsx, and the sums
 * that decide what to draw live here where they can be tested. The rules they
 * encode are not obvious and each of them was learnt from a phone:
 *
 *  - Safari caps a canvas's backing store at roughly 16.7 million pixels. Hand
 *    `drawImage` a 48-megapixel photograph from a recent iPhone and you do not
 *    get an error, you get a silently blank canvas — and the decode on the way
 *    there can take the tab out entirely.
 *  - Downscaling by a large factor in one `drawImage` aliases badly, because
 *    the browser samples rather than averages. Two smaller steps look like a
 *    photograph; one big one looks like a screenshot of a photograph.
 *  - base64 is four bytes on the wire for every three bytes of JPEG, so a
 *    budget stated in bytes has to be checked after the encoding, not before.
 */

export interface Size {
  width: number;
  height: number;
}

/**
 * Safari's canvas area ceiling, rounded down from 16,777,216 (4096²) with room
 * to spare. A canvas past this point allocates and then paints nothing.
 */
export const MAX_CANVAS_PIXELS = 16_700_000;

/** Where a proof photo lands: big enough to read a barbell, small enough to send. */
export const TARGET_LONG_EDGE = 1100;

/**
 * 180 KB of base64 per proof. The number comes from the other end: a later unit
 * carries these to the partner's phone, and the wire there has hard caps.
 */
export const PHOTO_BUDGET_BYTES = 180 * 1024;

/**
 * JPEG quality, walked downwards until the encoded result fits. It starts high
 * because most photographs fit at the first rung, and it stops at 0.4 because
 * below that a gym is mostly rectangles.
 */
export const QUALITY_LADDER = [0.82, 0.72, 0.62, 0.52, 0.42] as const;

function clampSide(value: number): number {
  return Math.max(1, Math.round(value));
}

/**
 * Scales a size so neither side exceeds `longEdge`, keeping the aspect ratio.
 * An image already smaller than the target is left alone rather than blown up:
 * upscaling costs bytes and adds nothing.
 */
export function fitLongEdge(size: Size, longEdge: number = TARGET_LONG_EDGE): Size {
  const longest = Math.max(size.width, size.height);
  if (longest <= longEdge) return { width: clampSide(size.width), height: clampSide(size.height) };
  const scale = longEdge / longest;
  return { width: clampSide(size.width * scale), height: clampSide(size.height * scale) };
}

/** Whether a size is past the point where a canvas paints nothing. */
export function exceedsCanvasArea(size: Size, maxPixels: number = MAX_CANVAS_PIXELS): boolean {
  return size.width * size.height > maxPixels;
}

/**
 * The largest version of a size that a canvas will actually paint. Used on the
 * decode rather than on the output: what matters is that nothing oversized ever
 * reaches a canvas at all.
 */
export function fitPixelBudget(size: Size, maxPixels: number = MAX_CANVAS_PIXELS): Size {
  if (!exceedsCanvasArea(size, maxPixels)) {
    return { width: clampSide(size.width), height: clampSide(size.height) };
  }
  const scale = Math.sqrt(maxPixels / (size.width * size.height));
  return { width: clampSide(size.width * scale), height: clampSide(size.height * scale) };
}

/**
 * The sizes to draw through, in order, ending at `target`.
 *
 * One step when the reduction is mild, two when it is not. Halving twice reads
 * as a photograph; going from 4000px to 1100px in a single `drawImage` reads as
 * a photograph someone has sharpened with a hammer.
 */
export function scaleSteps(source: Size, target: Size): Size[] {
  const safe = fitPixelBudget(source);
  const factor = Math.max(target.width / safe.width, target.height / safe.height);
  if (factor >= 0.5) return [target];
  const midpoint: Size = {
    width: clampSide(Math.sqrt(safe.width * target.width)),
    height: clampSide(Math.sqrt(safe.height * target.height)),
  };
  // A midpoint that has already arrived at the target buys nothing.
  if (midpoint.width <= target.width || midpoint.height <= target.height) return [target];
  return [midpoint, target];
}

/** base64 spends four characters on every three bytes, padded to a multiple of four. */
export function base64BytesFor(binaryBytes: number): number {
  return Math.ceil(binaryBytes / 3) * 4;
}

/**
 * The size of a data URI's payload, which is what actually has to fit — the
 * `data:image/jpeg;base64,` preamble is not part of anyone's budget but is part
 * of the string, so measuring the string as a whole overstates by a few dozen
 * bytes. base64 is ASCII, so one character is one byte.
 */
export function base64PayloadBytes(dataUri: string): number {
  const comma = dataUri.indexOf(',');
  return comma === -1 ? dataUri.length : dataUri.length - comma - 1;
}

export function withinBudget(dataUri: string, budget: number = PHOTO_BUDGET_BYTES): boolean {
  return base64PayloadBytes(dataUri) <= budget;
}

/**
 * When the whole quality ladder was still too big, the pixels have to go. A
 * fifth off the long edge is roughly a third off the area, which is enough to
 * make progress and small enough not to throw the photograph away.
 */
export function shrinkLongEdge(size: Size, factor = 0.8): Size {
  return {
    width: clampSide(size.width * factor),
    height: clampSide(size.height * factor),
  };
}

/**
 * The first candidate that fits, or the smallest one if none of them do.
 *
 * Null only when nothing was encoded at all. A photograph the ladder could not
 * squeeze is still better kept than silently dropped, and the caller shows what
 * it weighs so the person can decide.
 */
export function pickWithinBudget(
  candidates: string[],
  budget: number = PHOTO_BUDGET_BYTES,
): string | null {
  if (candidates.length === 0) return null;
  const fitting = candidates.find((uri) => withinBudget(uri, budget));
  if (fitting) return fitting;
  return candidates.reduce((best, uri) => (
    base64PayloadBytes(uri) < base64PayloadBytes(best) ? uri : best
  ));
}

/** "142 KB" — the size of a proof, in the one unit anybody reads it in. */
export function describeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Which camera a proof came from, in the words the screen uses for it. */
export function facingLabel(facing: WorkoutPhoto['facing']): string {
  return facing === 'back' ? 'The lift' : 'You';
}
