import { ARENA_HEIGHT } from './arena';

/**
 * How the battle board is seen: from the south, looking down at 45 degrees.
 *
 * Upright 2D pets stand on a board seen at an angle. The floor is foreshortened,
 * so a row is `ROW_RATIO` as tall as a column is wide, but a pet is drawn
 * full-front at its own size, the way a figure standing on a table looks from
 * the front. That is what makes the pets read as flat and the board as solid.
 *
 * Pure: the three.js bake (`mascots/3d/boardCamera.ts`) and the Phaser scene both
 * need these numbers, and neither may import the other. The page hands them to
 * the bake as plain numbers; the scene imports them from here. The grid itself
 * is still `arena.ts`: this file only says where a tile lands on the screen.
 */

export const BOARD_ELEVATION_DEG = 45;

/** How tall a row is, as a fraction of how wide a column is. */
export const ROW_RATIO = Math.sin((BOARD_ELEVATION_DEG * Math.PI) / 180);

/**
 * Room above row 0, in tiles, for a sprite one tile tall standing in it: the
 * sprite is taller than the row it stands in by exactly this much. The ring of
 * hedge leans into it too, by less.
 */
export const HEADROOM_TILES = 1 - ROW_RATIO;

/** The whole picture, in tiles: the foreshortened rows plus the room above them. */
export const BOARD_HEIGHT_TILES = ARENA_HEIGHT * ROW_RATIO + HEADROOM_TILES;

/** Pixel height of the board for a tile `size` pixels wide. */
export function boardPixelHeight(size: number): number {
  return Math.round(size * BOARD_HEIGHT_TILES);
}

/** Pixel height of one row. */
export const rowHeight = (size: number): number => size * ROW_RATIO;

/** Top of a row's ground, in pixels from the top of the picture. */
export const cellTop = (row: number, size: number): number => size * (HEADROOM_TILES + row * ROW_RATIO);

/** Bottom of a row's ground: where the feet of whatever stands in the row are. */
export const footY = (row: number, size: number): number => cellTop(row + 1, size);

/** Where a sprite `size` tall is drawn (its top edge) so its feet are on the row's bottom edge. */
export const spriteY = (row: number, size: number): number => footY(row, size) - size;

/** The row under a pixel, as the tap handler needs it. Rounded down, so a tap above row 0 is row -1. */
export const rowAt = (pixelY: number, size: number): number =>
  Math.floor((pixelY - size * HEADROOM_TILES) / (size * ROW_RATIO));
