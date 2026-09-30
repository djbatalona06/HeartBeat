/**
 * How a step looks, as numbers the scene can apply and a test can hold.
 *
 * Walking up and down used to read as sliding, for two reasons this file
 * answers: a sprite's draw order never changed with its row, so the pet stayed
 * in front of the monster even standing above it, and a vertical step had
 * nothing to distinguish it from being dragged. Depth now follows the row, and
 * a vertical step lifts a little in the middle, the way a small thing hops.
 */

/** The band sprites are drawn in. Shadows sit under it; effects sit over it. */
export const SPRITE_DEPTH_FLOOR = 9;
export const SPRITE_DEPTH_CEILING = 10;

/**
 * A sprite's depth for the row it stands on: lower on screen is nearer, so it
 * draws on top. Stays inside the sprite band for any row the arena can have.
 */
export function depthForRow(row: number, rows: number): number {
  const clamped = Math.min(Math.max(row, 0), Math.max(rows - 1, 0));
  return SPRITE_DEPTH_FLOOR + clamped / Math.max(rows, 1);
}

/** How high a vertical step lifts at its midpoint, in unscaled pixels. */
export const HOP_PX = 3;

/** The lift for one step. Sideways steps and calm take none. */
export function hopFor({ dy, calm }: { dy: number; calm: boolean }): number {
  return calm || dy === 0 ? 0 : HOP_PX;
}

/** Where along its arc a step is at progress `t` (0-1): up and back down. */
export function liftAt(t: number, hop: number): number {
  return hop * Math.sin(Math.PI * Math.min(Math.max(t, 0), 1));
}
