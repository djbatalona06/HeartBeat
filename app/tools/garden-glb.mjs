/**
 * Builds `public/media/heartbeat-gardens/garden.glb` — the one 3D tree the home
 * screen draws behind its cards.
 *
 *   node app/tools/garden-glb.mjs          # (re)writes the file
 *
 * The file is committed; this script is how it was made, so the tree can be
 * changed on purpose rather than replaced by hand. It is deterministic: the
 * same script writes the same bytes, which is what lets a change to the tree
 * show up as a change in review.
 *
 * ## What is in the file, and why it is shaped this way
 *
 * - **Roles, not colours.** Every material is named for its job — `leaf`,
 *   `leafAlt`, `bloom`, `trunk`, `rock`, `ground`. The app repaints them from
 *   the couple's theme at runtime (`mascots/3d/gardenScene.ts`), the same way
 *   the 3D pets are repainted, so one 40 KB file serves all five packs in both
 *   palettes. The colours written here are what any other viewer shows.
 * - **No normals.** Faces are flat-shaded on purpose (the low-poly look), and a
 *   glTF with no `NORMAL` is *defined* to be flat-shaded. Leaving them out
 *   halves the file and costs nothing.
 * - **Vertex colour carries the shading** — darker at the foot of every blob,
 *   lighter at the crown — so a flat-lit shape still reads as sitting on the
 *   ground rather than floating over it.
 * - **Node names are the animation API.** `canopy` sways, `petal-*` drift down
 *   and spin. The app finds them by name; nothing else is needed to animate.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BufferAttribute, Color, CylinderGeometry, DodecahedronGeometry, Group, IcosahedronGeometry,
  Mesh, MeshStandardMaterial, OctahedronGeometry, Scene,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// GLTFExporter reads blobs through FileReader, which Node does not have.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); });
  }
};

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/media/heartbeat-gardens/garden.glb');

// ---- a small deterministic random -------------------------------------------
let seed = 20261008;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const between = (a, b) => a + (b - a) * rand();

// ---- materials: named for their role ----------------------------------------
const mat = (name, hex) => {
  const m = new MeshStandardMaterial({ color: new Color(hex), roughness: 1, metalness: 0 });
  m.name = name;
  m.vertexColors = true;
  return m;
};
const M = {
  leaf: mat('leaf', '#e8743b'),
  leafAlt: mat('leafAlt', '#c9503a'),
  bloom: mat('bloom', '#f2b134'),
  trunk: mat('trunk', '#5a3b36'),
  rock: mat('rock', '#7b8fa6'),
  ground: mat('ground', '#8a5a44'),
};

// ---- geometry helpers --------------------------------------------------------
/**
 * A blob: a polyhedron, welded so it is indexed, nudged off-regular, and
 * shaded by height. `bottom`/`top` are the vertex-colour grey at each end —
 * the material's colour is multiplied by them.
 */
function blob(geo, jitter, bottom = 0.62, top = 1) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const g = mergeVertices(geo, 1e-4);
  const p = g.getAttribute('position');
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < p.count; i += 1) {
    const k = 1 + (rand() - 0.5) * 2 * jitter;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * (1 + (rand() - 0.5) * jitter), p.getZ(i) * k);
    lo = Math.min(lo, p.getY(i));
    hi = Math.max(hi, p.getY(i));
  }
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 1) {
    const t = (p.getY(i) - lo) / (hi - lo || 1);
    const v = bottom + (top - bottom) * t;
    c.set([v, v, v], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

function put(parent, name, geo, material, [x, y, z], [sx, sy, sz] = [1, 1, 1], ry = 0) {
  const mesh = new Mesh(geo, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}

const scene = new Scene();
scene.name = 'garden';

// ---- ground: a rough disc ----------------------------------------------------
{
  const g = new CylinderGeometry(11, 12.5, 1.4, 28, 1);
  const base = blob(g, 0.05, 0.7, 1);
  put(scene, 'ground', base, M.ground, [0, -0.7, 0]);
}

// ---- trunk: a flared stem and roots -----------------------------------------
{
  const trunk = new Group();
  trunk.name = 'trunk';
  scene.add(trunk);
  const stem = blob(new CylinderGeometry(0.85, 1.5, 6.4, 9, 3), 0.1, 0.55, 1);
  put(trunk, 'stem', stem, M.trunk, [0, 3.1, 0]);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + between(-0.2, 0.2);
    const root = blob(new CylinderGeometry(0.1, 0.55, 2.4, 6, 1), 0.12, 0.5, 0.9);
    const m = put(trunk, `root-${i}`, root, M.trunk, [Math.cos(a) * 1.5, 0.35, Math.sin(a) * 1.5]);
    m.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    const arm = blob(new CylinderGeometry(0.28, 0.5, 3.4, 6, 1), 0.1, 0.6, 1);
    const m = put(trunk, `branch-${i}`, arm, M.trunk, [Math.cos(a) * 1.3, 6.2, Math.sin(a) * 1.3]);
    m.rotation.set(Math.sin(a) * 0.85, 0, -Math.cos(a) * 0.85);
  }
}

// ---- canopy: faceted clouds in two rings and a crown ------------------------
const canopy = new Group();
canopy.name = 'canopy';
canopy.position.set(0, 0, 0);
scene.add(canopy);
{
  const rings = [
    { n: 8, r: 3.6, y: 7.0, size: [1.9, 2.5] },
    { n: 6, r: 2.2, y: 8.7, size: [1.8, 2.3] },
  ];
  let k = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i += 1) {
      const a = (i / ring.n) * Math.PI * 2 + between(-0.25, 0.25);
      const s = between(...ring.size);
      const mat = rand() < 0.3 ? M.leafAlt : M.leaf;
      const g = blob(new IcosahedronGeometry(1, 1), 0.16, 0.55, 1);
      put(canopy, `leaves-${k}`, g, mat,
        [Math.cos(a) * ring.r, ring.y + between(-0.4, 0.4), Math.sin(a) * ring.r],
        [s, s * between(0.7, 0.85), s], rand() * 6);
      k += 1;
    }
  }
  put(canopy, `leaves-${k}`, blob(new IcosahedronGeometry(1, 1), 0.14, 0.6, 1), M.leaf,
    [0, 10.2, 0], [2.4, 1.9, 2.4]);
}

// ---- bushes and rocks on the ground ------------------------------------------
for (let i = 0; i < 16; i += 1) {
  const a = (i / 16) * Math.PI * 2 + between(-0.18, 0.18);
  const r = between(4.2, 9.2);
  const s = between(0.9, 1.9);
  const pick = rand();
  const material = pick < 0.5 ? M.leaf : pick < 0.8 ? M.leafAlt : M.bloom;
  put(scene, `bush-${i}`, blob(new IcosahedronGeometry(1, 0), 0.22, 0.5, 1), material,
    [Math.cos(a) * r, s * 0.4, Math.sin(a) * r], [s * 1.15, s * 0.72, s * 1.15], rand() * 6);
}
for (let i = 0; i < 7; i += 1) {
  const a = (i / 7) * Math.PI * 2 + between(0, 0.8);
  const r = between(3.6, 8.4);
  const s = between(0.5, 1.2);
  put(scene, `rock-${i}`, blob(new DodecahedronGeometry(1, 0), 0.2, 0.55, 1), M.rock,
    [Math.cos(a) * r, s * 0.35, Math.sin(a) * r], [s * 1.2, s * 0.8, s], rand() * 6);
}

// ---- petals: the only things that fall ---------------------------------------
{
  const petal = blob(new OctahedronGeometry(0.16, 0), 0.1, 0.9, 1);
  for (let i = 0; i < 14; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = between(1.5, 7);
    const m = put(scene, `petal-${i}`, petal, rand() < 0.5 ? M.bloom : M.leaf,
      [Math.cos(a) * r, between(0.8, 9), Math.sin(a) * r], [1, 0.45, 1.6], rand() * 6);
    m.rotation.x = rand() * 3;
  }
}

// ---- write -------------------------------------------------------------------
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(glb));
console.log(`wrote ${OUT} (${(glb.byteLength / 1024).toFixed(1)} KiB)`);
