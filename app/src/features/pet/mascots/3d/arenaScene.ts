import {
  DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, SRGBColorSpace,
  Scene, WebGLRenderer,
  type BufferGeometry, type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARENA_ROLES, arenaPaint, type ArenaCssTokens, type ArenaRole, type MarkRole } from './arenaPalette';
import { finishArenaCanvas, rgbTokens } from './arenaFinish';
import { boardCamera, boardFrame } from './boardCamera';
import { buildBoardMarks } from './boardMarks';
import { buildBoardPieces } from './boardPieces';

/**
 * Draws the battle board's checkerboard **once**, then lets go of the GPU.
 *
 * Eve's Garden is a transparent Phaser canvas over a backdrop, and Phaser owns
 * the page's WebGL context while it runs. A second live three.js canvas beside
 * it is a second context for the whole fight, on phones that start refusing them
 * after a handful. So this renders a single frame into an offscreen renderer,
 * copies the pixels to a plain 2D canvas, and releases the context before
 * returning -- Phaser then takes the picture as a texture and never knows there
 * was a GPU in it. At no moment are two contexts alive.
 *
 * Lives under `mascots/3d/` for the same reason `gardenScene.ts` does: that path
 * is what puts three.js in the lazy `mascot3d` chunk. It imports nothing but
 * `three` (values) and its own siblings, and is only ever reached through
 * `import()` from `features/eve-garden/arenaFloor.ts`.
 *
 * Straight down, orthographic, and framed to exactly the board: with no
 * perspective, tile (col, row) lands on the same pixels as the sprite grid
 * above it, which is what lets the picture and the walkable grid be one grid.
 *
 * The camera is tilted (`boardCamera.ts`): in front of the board, looking down
 * at 45 degrees, still orthographic. Rows foreshorten, and the hedge, stone and
 * the rest (`boardPieces.ts`) show their fronts. Orthographic keeps every tile
 * one rectangle of the picture, so it is still one grid with the sprites above.
 */

export interface ArenaBakeOptions {
  src: string;
  cols: number;
  rows: number;
  /** Pixels per tile in the picture. */
  tilePx: number;
  /**
   * How the board is seen, as plain numbers from `domain/rpg/boardView.ts`
   * (which this file may not import): the elevation of the camera in degrees,
   * and the room above the top row in tiles. The picture comes out
   * `cols * tilePx` wide and as tall as `boardFrame` says.
   */
  elevationDeg: number;
  headroomTiles: number;
  /**
   * Tokens from the selected Raid Gate companion, in the current light/dark
   * mode. Required: with none the old code read the *app's* theme off the DOM,
   * which is not the companion's, and the floor quietly changed pack.
   */
  themeTokens: ArenaCssTokens;
  /**
   * What stands in each cell, by sprite name: `layout[row][col]`. Read from the
   * stage's own grid by the caller. Omitted, the floor is bare, as it always was.
   */
  layout?: readonly (readonly (string | undefined)[])[];
  /** What the chosen board kit lays on each ground tile: `marks[row][col]`. Omitted, the classic bare floor. */
  marks?: readonly (readonly (MarkRole | undefined)[])[];
  /** Asked once the file has loaded: true means nobody is waiting any more, so do not touch the GPU. */
  cancelled?: () => boolean;
}

/**
 * The checkerboard as a canvas `cols * tilePx` by `rows * tilePx`, or null when
 * there is no WebGL, no theme to read, or the file did not load -- in every one
 * of which the caller keeps drawing the pixel tiles it always has.
 */
export async function bakeArena(options: ArenaBakeOptions): Promise<HTMLCanvasElement | null> {
  const { src, cols, rows, tilePx, cancelled, themeTokens: themeColors, layout, marks, elevationDeg, headroomTiles } = options;
  const tokens = rgbTokens(themeColors);
  if (!tokens) return null;

  // Fetched and parsed *before* a renderer exists, so the WebGL context lives
  // only for the synchronous draw-and-copy below, a few milliseconds, and not
  // across a network wait that Phaser might start in the middle of.
  let gltf: Awaited<ReturnType<GLTFLoader['loadAsync']>>;
  try {
    gltf = await new GLTFLoader().loadAsync(src);
  } catch {
    return null;
  }
  if (cancelled?.()) return null;

  const frame = boardFrame(cols, rows, elevationDeg, headroomTiles);
  const width = Math.round(frame.widthTiles * tilePx);
  const height = Math.round(frame.heightTiles * tilePx);
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true });
  } catch {
    return null;
  }

  const meshes: Mesh[] = [];
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;

    const paint = arenaPaint(tokens);

    const scene = new Scene();
    const sky = new HemisphereLight(0xffffff, 0xffffff, paint.ambient);
    sky.color.setRGB(...paint.sky, SRGBColorSpace);
    sky.groundColor.setRGB(...paint.bounce, SRGBColorSpace);
    // From the upper left and in front, as the pixel tiles are lit, so the
    // tops and the fronts of the pieces both catch light.
    const sun = new DirectionalLight(0xffffff, paint.sun);
    sun.color.setRGB(...paint.sky, SRGBColorSpace);
    sun.position.set(-4, 9, 4);
    scene.add(sky, sun, gltf.scene);

    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      meshes.push(node);
      const material = node.material as MeshStandardMaterial;
      if (ARENA_ROLES.includes(material.name as ArenaRole)) {
        material.color.setRGB(...paint.colors[material.name as ArenaRole], SRGBColorSpace);
      }
    });

    if (marks) {
      const laid = buildBoardMarks(marks, paint.marks);
      scene.add(laid);
      laid.traverse((node) => {
        if (node instanceof Mesh) meshes.push(node);
      });
    }

    if (layout) {
      const pieces = buildBoardPieces(layout, paint.pieces);
      scene.add(pieces);
      pieces.traverse((node) => {
        if (node instanceof Mesh) meshes.push(node);
      });
    }

    renderer.render(scene, boardCamera(cols, rows, elevationDeg, headroomTiles));

    // Copied while the buffer is still valid (same task as the draw), so the
    // context can be torn down straight after.
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(renderer.domElement, 0, 0);
    finishArenaCanvas(out, themeColors, cols, rows, tilePx);
    out.dataset.arena3d = 'true';
    // Tells the scene the hedge, stone, water, beds and gate are in this
    // picture, so it does not draw them a second time from the pixel art.
    out.dataset.arenaPieces = layout ? 'true' : 'false';
    out.dataset.accent = themeColors.accent;
    return out;
  } catch {
    return null;
  } finally {
    for (const mesh of meshes) {
      geometries.add(mesh.geometry as BufferGeometry);
      materials.add(mesh.material as Material);
    }
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
