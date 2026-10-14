import { describe, expect, it } from 'vitest';
import { ARENA_HEIGHT, ISLAND_1_ARENAS, isWalkable } from './arena';
import {
  BOARD_ELEVATION_DEG, BOARD_HEIGHT_TILES, HEADROOM_TILES, ROW_RATIO,
  boardPixelHeight, cellTop, footY, rowAt, rowHeight, spriteY,
} from './boardView';

const SIZE = 48;

describe('the board view', () => {
  it('foreshortens a row by the sine of the elevation, so 45 degrees is about 0.71', () => {
    expect(BOARD_ELEVATION_DEG).toBe(45);
    expect(ROW_RATIO).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('lays rows one after another, each row-height tall, below the headroom', () => {
    expect(cellTop(0, SIZE)).toBeCloseTo(SIZE * HEADROOM_TILES, 9);
    for (let row = 0; row < ARENA_HEIGHT; row += 1) {
      expect(footY(row, SIZE) - cellTop(row, SIZE)).toBeCloseTo(rowHeight(SIZE), 9);
    }
    expect(footY(ARENA_HEIGHT - 1, SIZE)).toBeCloseTo(SIZE * BOARD_HEIGHT_TILES, 9);
    expect(boardPixelHeight(SIZE)).toBe(Math.round(footY(ARENA_HEIGHT - 1, SIZE)));
  });

  it('puts a sprite\'s feet on the bottom edge of its row, whatever the size of the sprite', () => {
    for (let row = 0; row < ARENA_HEIGHT; row += 1) {
      expect(spriteY(row, SIZE) + SIZE).toBeCloseTo(footY(row, SIZE), 9);
    }
  });

  /** Row 0 is where a one-tile-tall sprite sticks out the furthest; the picture has room for it. */
  it('leaves room above the top row for a sprite standing in it', () => {
    expect(spriteY(0, SIZE)).toBeGreaterThanOrEqual(-1e-9);
  });

  it('reads a tap back as the row it was drawn in, from top to bottom of every row', () => {
    for (let row = 0; row < ARENA_HEIGHT; row += 1) {
      expect(rowAt(cellTop(row, SIZE) + 0.5, SIZE)).toBe(row);
      expect(rowAt(footY(row, SIZE) - 0.5, SIZE)).toBe(row);
    }
    expect(rowAt(0, SIZE)).toBe(-1);
  });

  /**
   * Every authored stage walls the top row off, so nothing ever stands in it and
   * the headroom is only ever used by the hedge leaning into it. If a stage ever
   * opened row 0, the headroom above still holds a sprite, which the test above pins.
   */
  it('keeps row 0 of every authored stage solid', () => {
    for (const arena of ISLAND_1_ARENAS) {
      for (let x = 0; x < arena.rows[0].length; x += 1) expect(isWalkable(arena, x, 0)).toBe(false);
    }
  });
});
