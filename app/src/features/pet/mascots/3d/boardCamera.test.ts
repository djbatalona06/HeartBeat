import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BOARD_SHEAR, FLOOR_TOP, boardCamera } from './boardCamera';

const COLS = 11;
const ROWS = 7;

/** A world point as a fraction of the picture: 0..1 across, 0..1 down. */
function pixel(x: number, y: number, z: number): { u: number; v: number } {
  const p = new Vector3(x, y, z).project(boardCamera(COLS, ROWS));
  return { u: (p.x + 1) / 2, v: (1 - p.y) / 2 };
}

describe('the board camera', () => {
  it('puts a point on the floor where the top-down camera did: tile (col, row) is its own cell', () => {
    for (const [col, row] of [[0, 0], [5, 3], [10, 6], [2, 5]]) {
      const { u, v } = pixel(col - (COLS - 1) / 2, FLOOR_TOP, row - (ROWS - 1) / 2);
      expect(u, `col ${col}`).toBeCloseTo((col + 0.5) / COLS, 6);
      expect(v, `row ${row}`).toBeCloseTo((row + 0.5) / ROWS, 6);
    }
  });

  it('leans a raised point up the picture by its height, in tiles, and not sideways', () => {
    const floor = pixel(1, FLOOR_TOP, 1);
    for (const h of [0.1, 0.3]) {
      const raised = pixel(1, FLOOR_TOP + h, 1);
      expect(raised.u).toBeCloseTo(floor.u, 6);
      expect((floor.v - raised.v) * ROWS).toBeCloseTo(h * BOARD_SHEAR, 6);
    }
  });

  it('drops a point below the floor down the picture', () => {
    const floor = pixel(0, FLOOR_TOP, 0);
    expect(pixel(0, FLOOR_TOP - 0.06, 0).v).toBeGreaterThan(floor.v);
  });

  it('keeps the whole board in frame', () => {
    for (const [x, z] of [[-COLS / 2, -ROWS / 2], [COLS / 2, ROWS / 2]]) {
      const { u, v } = pixel(x, FLOOR_TOP, z);
      expect(u).toBeGreaterThanOrEqual(-1e-9);
      expect(u).toBeLessThanOrEqual(1 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
