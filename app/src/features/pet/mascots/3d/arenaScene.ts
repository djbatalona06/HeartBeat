import {
  DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, OrthographicCamera, SRGBColorSpace,
  Scene, WebGLRenderer,
  type BufferGeometry, type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toRgb } from './cssColor';
import { ARENA_ROLES, arenaPaint, type ArenaRole } from './arenaPalette';
import type { Tokens } from './gardenPalette';

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
 */

/** The tokens the board is painted from, read off the element that wears the theme. */
function tokensOf(el: HTMLElement): Tokens | null {
  const style = getComputedStyle(el);
  const read = (name: string) => toRgb(style.getPropertyValue(name).trim());
  const base = read('--color-base');
  const text = read('--color-text');
  const accent = read('--color-accent');
  const success = read('--color-success');
  const danger = read('--color-danger');
  return base && text && accent && success && danger ? { base, text, accent, success, danger } : null;
}

export interface ArenaBakeOptions {
  /** Where the theme's custom properties are read from. */
  host: HTMLElement;
  src: string;
  cols: number;
  rows: number;
  /** Pixels per tile in the picture. */
  tilePx: number;
  /** Asked once the file has loaded: true means nobody is waiting any more, so do not touch the GPU. */
  cancelled?: () => boolean;
}

/**
 * The checkerboard as a canvas `cols * tilePx` by `rows * tilePx`, or null when
 * there is no WebGL, no theme to read, or the file did not load -- in every one
 * of which the caller keeps drawing the pixel tiles it always has.
 */
export async function bakeArena(options: ArenaBakeOptions): Promise<HTMLCanvasElement | null> {
  const { host, src, cols, rows, tilePx, cancelled } = options;
  const tokens = tokensOf(host);
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

  const width = cols * tilePx;
  const height = rows * tilePx;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true });
  } catch {
    return null;
  }

  const meshes: Mesh[] = [];
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
    // From the upper left, as the pixel tiles are lit, so every bevel catches
    // light on the same two sides.
    const sun = new DirectionalLight(0xffffff, paint.sun);
    sun.color.setRGB(...paint.sky, SRGBColorSpace);
    sun.position.set(-4, 9, -3);
    scene.add(sky, sun, gltf.scene);

    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      meshes.push(node);
      const material = node.material as MeshStandardMaterial;
      if (ARENA_ROLES.includes(material.name as ArenaRole)) {
        material.color.setRGB(...paint.colors[material.name as ArenaRole], SRGBColorSpace);
      }
    });

    // Looking down -Y with -Z up the screen: +X is right and +Z is down, which
    // is the order a grid of rows is read in.
    const camera = new OrthographicCamera(-cols / 2, cols / 2, rows / 2, -rows / 2, 0.1, 40);
    camera.position.set(0, 12, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);

    // Copied while the buffer is still valid (same task as the draw), so the
    // context can be torn down straight after.
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(renderer.domElement, 0, 0);
    return out;
  } catch {
    return null;
  } finally {
    for (const mesh of meshes) {
      (mesh.geometry as BufferGeometry).dispose();
      (mesh.material as Material).dispose();
    }
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
