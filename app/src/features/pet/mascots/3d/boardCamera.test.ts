import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BOARD_ELEVATION_DEG, HEADROOM_TILES, BOARD_HEIGHT_TILES, ROW_RATIO, cellTop } from '../../../../domain/rpg/boardView';
import { FLOOR_TOP, boardCamera, boardFrame } from './boardCamera';

const COLS = 11;
const ROWS = 7;
const camera = () => boardCamera(COLS, ROWS, BOARD_ELEVATION_DEG, HEADROOM_TILES);

/** A world point as a fraction of the picture: 0..1 across, 0..1 down. */
function pixel(x: number, y: number, z: number): { u: number; v: number } {
  const p = new Vector3(x, y, z).project(camera());
  return { u: (p.x + 1) / 2, v: (1 - p.y) / 2 };
}

describe('the board camera', () => {
  it('frames exactly the picture the scene lays out: as wide as the board, as tall as the board view says', () => {
    const frame = boardFrame(COLS, ROWS, BOARD_ELEVATION_DEG, HEADROOM_TILES);
    expect(frame.widthTiles).toBe(COLS);
    expect(frame.heightTiles).toBeCloseTo(BOARD_HEIGHT_TILES, 12);
  });

  /** The test that holds the bake and Phaser to one grid: each tile's centre lands in the cell the scene draws it in. */
  it('puts the centre of tile (col, row) in the cell the scene lays out for it', () => {
    for (const [col, row] of [[0, 0], [5, 3], [10, 6], [2, 5], [9, 1]]) {
      const { u, v } = pixel(col - (COLS - 1) / 2, FLOOR_TOP, row - (ROWS - 1) / 2);
      expect(u, `col ${col}`).toBeCloseTo((col + 0.5) / COLS, 6);
      // Rows are measured from the top of the picture in tiles, like the scene's `cellTop`.
      const centre = cellTop(row, 1) + ROW_RATIO / 2;
      expect(v, `row ${row}`).toBeCloseTo(centre / BOARD_HEIGHT_TILES, 6);
    }
  });

  it('lifts a raised point up the picture by its height times the cosine of the elevation, and not sideways', () => {
    const floor = pixel(1, FLOOR_TOP, 1);
    const cos = Math.cos((BOARD_ELEVATION_DEG * Math.PI) / 180);
    for (const h of [0.1, 0.3]) {
      const raised = pixel(1, FLOOR_TOP + h, 1);
      expect(raised.u).toBeCloseTo(floor.u, 6);
      expect((floor.v - raised.v) * BOARD_HEIGHT_TILES).toBeCloseTo(h * cos, 6);
    }
  });

  it('keeps the whole floor in frame, with the headroom above it empty', () => {
    const north = pixel(0, FLOOR_TOP, -ROWS / 2);
    const south = pixel(0, FLOOR_TOP, ROWS / 2);
    expect(north.v * BOARD_HEIGHT_TILES).toBeCloseTo(HEADROOM_TILES, 6);
    expect(south.v).toBeCloseTo(1, 6);
    expect(pixel(-COLS / 2, FLOOR_TOP, 0).u).toBeCloseTo(0, 6);
    expect(pixel(COLS / 2, FLOOR_TOP, 0).u).toBeCloseTo(1, 6);
  });
});
