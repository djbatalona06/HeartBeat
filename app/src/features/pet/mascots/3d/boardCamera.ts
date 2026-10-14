import { OrthographicCamera } from 'three';

/**
 * The camera the battle board is drawn with: orthographic, in front of the
 * board and above it, looking down at `elevationDeg`.
 *
 * ## One view, shared with the scene
 *
 * Phaser lays the board out with the same numbers (`domain/rpg/boardView.ts`):
 * a row is `sin(elevation)` as tall as a column is wide, and a point `h` above
 * the floor rises up the picture by `h * cos(elevation)`. This file cannot import
 * that one (nothing under `3d/` may import from outside it), so the page hands
 * the elevation and the headroom in as plain numbers, and a test holds the two
 * to the same answer.
 *
 * Orthographic on purpose: with no perspective every column is the same width
 * top to bottom, so tile (col, row) is one rectangle of the picture and the
 * picture and the walkable grid stay one grid.
 *
 * Pure three.js maths, no renderer: the test projects points with it and needs
 * no GPU.
 */

/**
 * Where the tiles' tops are. The floor's squares are small frustums 0.2 high
 * (`tools/arena-glb.mjs`); heights are measured from their top.
 */
export const FLOOR_TOP = 0.2;

const DISTANCE = 20;

export interface BoardFrame {
  /** The picture's size in tiles: as wide as the board, as tall as its rows foreshortened plus the headroom. */
  widthTiles: number;
  heightTiles: number;
}

export function boardFrame(cols: number, rows: number, elevationDeg: number, headroomTiles: number): BoardFrame {
  const sin = Math.sin((elevationDeg * Math.PI) / 180);
  return { widthTiles: cols, heightTiles: rows * sin + headroomTiles };
}

export function boardCamera(
  cols: number,
  rows: number,
  elevationDeg: number,
  headroomTiles: number,
): OrthographicCamera {
  const elevation = (elevationDeg * Math.PI) / 180;
  const groundDepth = rows * Math.sin(elevation);
  // The frustum is the picture: the foreshortened board fills it from the
  // bottom, and the headroom is left above for what stands tall in the top row.
  const camera = new OrthographicCamera(-cols / 2, cols / 2, groundDepth / 2 + headroomTiles, -groundDepth / 2, 0.1, 60);
  // In front of the board (south, +z) and above it, looking at the middle of the floor.
  camera.position.set(0, FLOOR_TOP + DISTANCE * Math.sin(elevation), DISTANCE * Math.cos(elevation));
  camera.up.set(0, 1, 0);
  camera.lookAt(0, FLOOR_TOP, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}
