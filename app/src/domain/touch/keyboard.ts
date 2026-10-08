/**
 * How much of the screen the on-screen keyboard is covering.
 *
 * iOS does not shrink the layout viewport for the keyboard, so a fixed bar
 * docked to the bottom ends up under it. The visual viewport does shrink, and
 * the difference between the two is the keyboard. Below `KEYBOARD_MIN_PX` it is
 * a browser toolbar showing or hiding, not a keyboard, and is ignored.
 */
export const KEYBOARD_MIN_PX = 120;

export function keyboardInset(
  layoutHeight: number,
  visualHeight: number,
  visualTop: number,
  /** `visualViewport.scale`. A pinch-zoom shrinks the visual viewport too. */
  scale = 1,
): number {
  if (scale > 1.01) return 0;
  const covered = Math.round(layoutHeight - visualHeight - visualTop);
  return covered >= KEYBOARD_MIN_PX ? covered : 0;
}
