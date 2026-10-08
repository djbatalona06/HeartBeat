/**
 * Builds `public/media/heartbeat-gardens/arena.glb` — the checkerboard floor
 * under Eve's Garden's battle board.
 *
 *   npm run arena:glb --workspace app       # (re)writes the file
 *
 * Same idea as `garden-glb.mjs`, and made the same way (three's own
 * `GLTFExporter`, a seeded random, flat shading, vertex colour doing the
 * shading), so a change to the floor is a change in review rather than a
 * binary swapped by hand. It is deterministic: the same script writes the same
 * bytes.
 *
 * ## Shape
 *
 * One unit is one battle tile, and the board is exactly the arena's grid:
 * `ARENA_WIDTH` x `ARENA_HEIGHT` (11 x 7) tiles centred on the origin, tile
 * (col, row) at x = col - 5, z = row - 3. `domain/rpg/arena.ts` is the
 * authority on that size and `arenaModel.test.ts` fails if the two disagree,
 * because the picture and the walkable grid must be one grid.
 *
 * Every tile is a shallow frustum, so a camera looking straight down sees a
 * bevelled edge on each square rather than a flat sticker. Even tiles are one
 * material and odd tiles the other, merged into two meshes (`tilesA`, `tilesB`)
 * to keep the file small; a thin `grout` plate sits underneath and shows
 * through the gaps.
 *
 * ## Roles, not colours
 *
 * Materials are named for their job (`tileA`, `tileB`, `grout`). The app repaints
 * them from the couple's theme (`mascots/3d/arenaPalette.ts`), so one file
 * serves all five packs in both palettes. The colours written here are only what
 * another viewer would show.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BoxGeometry, BufferAttribute, Color, CylinderGeometry, Mesh, MeshStandardMaterial, Scene,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// GLTFExporter reads blobs through FileReader, which Node does not have.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); });
  }
};

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/media/heartbeat-gardens/arena.glb');

// Kept equal to `ARENA_WIDTH` / `ARENA_HEIGHT` in `domain/rpg/arena.ts`;
// `arenaModel.test.ts` reads the file back and checks.
const COLS = 11;
const ROWS = 7;

let seed = 20261009;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const mat = (name, hex) => {
  const m = new MeshStandardMaterial({ color: new Color(hex), roughness: 1, metalness: 0 });
  m.name = name;
  m.vertexColors = true;
  return m;
};
const M = {
  tileA: mat('tileA', '#c9a98b'),
  tileB: mat('tileB', '#a98468'),
  grout: mat('grout', '#4a3a36'),
};

/** One bevelled tile at (col, row): a four-sided frustum, brighter on top. */
function tile(col, row) {
  const g = new CylinderGeometry(0.6, 0.68, 0.2, 4, 1);
  g.rotateY(Math.PI / 4);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const w = mergeVertices(g, 1e-4);
  w.translate(col - (COLS - 1) / 2, 0.1, row - (ROWS - 1) / 2);
  // A touch of hand-made unevenness: each tile a little lighter or darker.
  const wobble = 0.94 + rand() * 0.06;
  const p = w.getAttribute('position');
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 1) {
    const v = (p.getY(i) > 0.15 ? 1 : 0.66) * wobble;
    c.set([v, v, v], i * 3);
  }
  w.setAttribute('color', new BufferAttribute(c, 3));
  return w;
}

const even = [];
const odd = [];
for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLS; col += 1) (((col + row) % 2 === 0) ? even : odd).push(tile(col, row));
}

const scene = new Scene();
scene.name = 'arena';

const add = (name, geometry, material) => {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  scene.add(mesh);
};

{
  const plate = new BoxGeometry(COLS, 0.1, ROWS);
  plate.deleteAttribute('normal');
  plate.deleteAttribute('uv');
  const g = mergeVertices(plate, 1e-4);
  g.translate(0, 0.05, 0);
  const c = new Float32Array(g.getAttribute('position').count * 3).fill(0.8);
  g.setAttribute('color', new BufferAttribute(c, 3));
  add('grout', g, M.grout);
}
add('tilesA', mergeGeometries(even), M.tileA);
add('tilesB', mergeGeometries(odd), M.tileB);

const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(glb));
console.log(`wrote ${OUT} (${(glb.byteLength / 1024).toFixed(1)} KiB)`);
