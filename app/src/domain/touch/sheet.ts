/**
 * Whether a dragged sheet should close when the finger lets go.
 *
 * Either far enough (a third of its own height) or fast enough (a flick), the
 * same two ways an iOS sheet decides. Anything else springs back.
 */
export const SHEET_DISMISS_FRACTION = 1 / 3;
/** px per ms; about the speed of a deliberate downward flick. */
export const SHEET_FLICK_SPEED = 0.6;

export function shouldDismissSheet(dy: number, velocity: number, height: number): boolean {
  if (dy <= 0) return false;
  if (velocity >= SHEET_FLICK_SPEED) return true;
  return height > 0 && dy >= height * SHEET_DISMISS_FRACTION;
}

/** Upward drags resist rather than lift the sheet off its edge. */
export function sheetOffset(dy: number): number {
  return dy >= 0 ? dy : -Math.sqrt(-dy);
}
