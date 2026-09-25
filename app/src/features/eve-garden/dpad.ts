/**
 * The on-screen pad's four directions, as data.
 *
 * The pad adds no movement of its own: each button calls the scene's `step()`,
 * the same one the arrow keys and a canvas tap already use, so a wall, the
 * monster's tile and "walk into it to fight" cannot behave differently
 * depending on which of the three you reached for.
 */

export interface Direction {
  key: 'up' | 'down' | 'left' | 'right';
  /** The button's accessible name. */
  label: string;
  /** Which way its arrow points; see `Icon`. */
  turn: 'up' | 'down' | 'left' | 'right';
  dx: number;
  dy: number;
}

/** In grid order: the pad is a 3x3 with these four on the edges. */
export const DIRECTIONS: readonly Direction[] = [
  { key: 'up', label: 'Walk up', turn: 'up', dx: 0, dy: -1 },
  { key: 'left', label: 'Walk left', turn: 'left', dx: -1, dy: 0 },
  { key: 'right', label: 'Walk right', turn: 'right', dx: 1, dy: 0 },
  { key: 'down', label: 'Walk down', turn: 'down', dx: 0, dy: 1 },
];

/**
 * How often a held button steps again. A little over the scene's 140 ms tween,
 * so a repeat lands just after the last step settles rather than being turned
 * away as `busy` every other tick.
 */
export const HOLD_REPEAT_MS = 180;
