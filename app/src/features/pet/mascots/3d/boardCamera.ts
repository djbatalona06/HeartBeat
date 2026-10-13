import { Matrix4, OrthographicCamera } from 'three';

/**
 * The camera the battle board is drawn with: straight down, but sheared, so
 * things that stand up lean towards the top of the picture.
 *
 * ## Why a shear and not a tilt
 *
 * A camera tilted off vertical squashes the floor: a tile is no longer square on
 * the screen and tile (col, row) no longer lands on the pixels the sprite grid
 * puts it on. Phaser's walking, tap targets and `depthForRow` all read that grid.
 * A shear leaves the ground plane alone -- a point on the floor projects to
 * exactly where the top-down camera put it -- and only moves a point by its
 * height above the floor. So the board gains sides to look at and the grid does
 * not move.
 *
 * Pure three.js maths, no renderer: the test projects points with it and needs
 * no GPU.
 */

/** Screen rise per unit of height, in tiles. 1 means a piece 0.3 high leans 0.3 of a tile. */
export const BOARD_SHEAR = 1;

/** Camera height above the floor plane, as `arenaScene` has always had it. */
export const CAMERA_HEIGHT = 12;

/**
 * Where the tiles' tops are. The floor's squares are small frustums 0.2 high
 * (`tools/arena-glb.mjs`); the plane they are measured from is their top, so the
 * checkerboard stays where it was and only what stands above it leans.
 */
export const FLOOR_TOP = 0.2;

export function boardCamera(cols: number, rows: number, shear = BOARD_SHEAR): OrthographicCamera {
  const camera = new OrthographicCamera(-cols / 2, cols / 2, rows / 2, -rows / 2, 0.1, 40);
  camera.position.set(0, CAMERA_HEIGHT, 0);
  // Looking down -Y with -Z up the screen: +X is right and +Z is down, which is
  // the order a grid of rows is read in.
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  // In view space the camera looks down -z, so a point's height above the floor
  // is `CAMERA_HEIGHT + z`. Lift screen-up (view y) by shear x (height - FLOOR_TOP).
  const lean = new Matrix4().set(
    1, 0, 0, 0,
    0, 1, shear, shear * (CAMERA_HEIGHT - FLOOR_TOP),
    0, 0, 1, 0,
    0, 0, 0, 1,
  );
  camera.projectionMatrix.multiply(lean);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}
