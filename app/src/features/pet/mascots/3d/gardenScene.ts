import {
  DirectionalLight, HemisphereLight, Material, Mesh, MeshStandardMaterial, Object3D,
  PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toRgb } from './cssColor';
import { gardenPaint, ROLES, type Rgb, type Role, type Tokens } from './gardenPalette';

/**
 * The home screen's tree, drawn live from `garden.glb`.
 *
 * It replaced five looping films. A clip is pixels somebody else already chose:
 * five fixed colour schemes, a visible seam every five seconds, 1.6 MB, and a
 * pack's palette change meant a new render. This is one 90 KB model, repainted
 * from the theme in front of it, turning slowly under a light that does not
 * loop — nothing on the home screen jumps back to the start.
 *
 * Like the pets (`engine.ts`) it lives in the lazy `mascot3d` chunk and is kept
 * out of the precache; unlike them it owns its renderer, because it is one
 * full-bleed canvas rather than a dozen small ones. It is released the moment
 * the screen unmounts. Until it has drawn a frame — or if there is no WebGL,
 * or the file never arrives — the drawn garden underneath is what shows.
 */

export interface GardenHandle {
  dispose(): void;
}

/** 30 fps: a slow turn and a few falling petals do not need more. */
const FRAME_MS = 1000 / 30;
/** The garden sits under a veil; retina past 1.5 is paint nobody sees. */
const MAX_DPR = 1.5;
const FOV = 36;
/** Where the camera looks: a little above the roots, so the crown has room. */
const FOCUS_Y = 5.6;
/** How much of the world must fit across, and up, the screen, in model units. */
const FIT_WIDTH = 11;
const FIT_HEIGHT = 15;
/** A slow turn either way — enough for the parallax to read, not enough to notice leaving. */
const SWING = 0.2;

interface Falling {
  node: Object3D;
  x: number;
  z: number;
  top: number;
  speed: number;
  phase: number;
  spin: number;
}

function tokensOf(el: Element): Tokens | null {
  const style = getComputedStyle(el);
  const read = (name: string): Rgb | null => {
    const css = style.getPropertyValue(name).trim();
    return css ? toRgb(css) : null;
  };
  const base = read('--color-base');
  const text = read('--color-text');
  const accent = read('--color-accent');
  const success = read('--color-success');
  const danger = read('--color-danger');
  return base && text && accent && success && danger ? { base, text, accent, success, danger } : null;
}

function calmNow(): boolean {
  return document.documentElement.dataset.calm === 'true'
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Starts drawing the garden into `canvas`. Returns null when there is no WebGL
 * to draw with, and the caller keeps the drawn garden.
 */
export function mountGarden(
  canvas: HTMLCanvasElement,
  src: string,
  onReady: (ok: boolean) => void,
): GardenHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  const sky = new HemisphereLight(0xffffff, 0xffffff, 1);
  const sun = new DirectionalLight(0xffffff, 1);
  sun.position.set(-8, 14, 9);
  scene.add(sky, sun);

  const materials = new Map<Role, MeshStandardMaterial>();
  const falling: Falling[] = [];
  let canopy: Object3D | null = null;
  let loaded = false;
  let shown = false;
  let gone = false;
  let stale = true;
  let dirty = true;
  let raf = 0;
  let lastFrame = 0;
  let w = 0;
  let h = 0;
  const born = performance.now();

  function paint(): void {
    stale = false;
    const tokens = tokensOf(canvas);
    if (!tokens) return;
    const p = gardenPaint(tokens);
    for (const role of ROLES) materials.get(role)?.color.setRGB(...p.colors[role], SRGBColorSpace);
    sky.color.setRGB(...p.sky, SRGBColorSpace);
    sky.groundColor.setRGB(...p.bounce, SRGBColorSpace);
    sky.intensity = p.ambient;
    sun.color.setRGB(...p.sky, SRGBColorSpace);
    sun.intensity = p.sun;
    dirty = true;
  }

  function fit(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const nw = Math.round(canvas.clientWidth * dpr);
    const nh = Math.round(canvas.clientHeight * dpr);
    if (nw === 0 || nh === 0 || (nw === w && nh === h)) return;
    w = nw;
    h = nh;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  function draw(t: number, calm: boolean): void {
    // Enough distance that FIT_WIDTH by FIT_HEIGHT of the world is always on
    // screen: a tall phone backs the camera up rather than cutting the tree off
    // at the knees, and a wide window does the same rather than at the crown.
    const half = Math.tan((FOV * Math.PI) / 360);
    const distance = Math.max(FIT_HEIGHT / 2 / half, FIT_WIDTH / 2 / (half * camera.aspect));
    const yaw = calm ? 0 : Math.sin(t * 0.09) * SWING;
    camera.position.set(Math.sin(yaw) * distance, FOCUS_Y + 2.2 + (calm ? 0 : Math.sin(t * 0.06) * 0.5), Math.cos(yaw) * distance);
    camera.lookAt(0, FOCUS_Y, 0);

    if (canopy && !calm) {
      canopy.rotation.z = Math.sin(t * 0.55) * 0.012;
      canopy.rotation.x = Math.sin(t * 0.4 + 1.3) * 0.01;
    }
    for (const f of falling) {
      const fall = calm ? 0 : (t * f.speed + f.phase) % f.top;
      f.node.position.set(
        f.x + (calm ? 0 : Math.sin(t * 0.7 + f.phase) * 0.6),
        f.top - fall,
        f.z + (calm ? 0 : Math.cos(t * 0.5 + f.phase) * 0.4),
      );
      f.node.rotation.y = calm ? f.spin : f.spin + t * 0.8;
    }

    renderer.render(scene, camera);
    dirty = false;
    if (!shown) {
      shown = true;
      onReady(true);
    }
  }

  function tick(now: number): void {
    raf = 0;
    if (gone || !loaded || document.hidden) return;
    const calm = calmNow();
    if (stale) paint();
    const due = now - lastFrame >= FRAME_MS - 1;
    if (dirty || (!calm && due)) {
      draw((now - born) / 1000, calm);
      lastFrame = now;
    }
    if (!calm) raf = requestAnimationFrame(tick);
  }

  function kick(): void {
    if (!raf && !gone) raf = requestAnimationFrame(tick);
  }

  // A theme, a palette mode or calm: each is an attribute write on the root.
  const watch = new MutationObserver(() => {
    stale = true;
    kick();
  });
  watch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'data-theme', 'data-mode', 'data-calm'],
  });
  const resize = new ResizeObserver(() => {
    fit();
    kick();
  });
  resize.observe(canvas);
  const onVisibility = () => {
    if (!document.hidden) kick();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onLost = (e: Event) => {
    // The GPU took the context back. The drawn garden is what shows again.
    e.preventDefault();
    onReady(false);
    dispose();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  new GLTFLoader().load(
    src,
    (gltf) => {
      if (gone) return;
      gltf.scene.traverse((o) => {
        if (o.name === 'canopy') canopy = o;
        if (o.name.startsWith('petal-')) {
          falling.push({
            node: o,
            x: o.position.x,
            z: o.position.z,
            top: 11,
            speed: 0.35 + (falling.length % 5) * 0.09,
            phase: falling.length * 1.7,
            spin: falling.length,
          });
        }
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        // One material per role, shared by every mesh that wears it, so a
        // repaint is six colour writes instead of one per leaf.
        const name = (mesh.material as Material).name as Role;
        let m = materials.get(name);
        if (!m && (ROLES as readonly string[]).includes(name)) {
          m = new MeshStandardMaterial({ flatShading: true, roughness: 1, metalness: 0, vertexColors: true });
          materials.set(name, m);
        }
        if (m) {
          (mesh.material as Material).dispose();
          mesh.material = m;
        }
      });
      scene.add(gltf.scene);
      loaded = true;
      fit();
      kick();
    },
    undefined,
    () => {
      // Offline with the file never cached: the drawn garden is the garden.
      if (!gone) onReady(false);
    },
  );

  function dispose(): void {
    if (gone) return;
    gone = true;
    cancelAnimationFrame(raf);
    watch.disconnect();
    resize.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onLost);
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of materials.values()) m.dispose();
    renderer.dispose();
    // Given back now, not whenever the collector gets round to it.
    renderer.forceContextLoss();
  }

  return { dispose };
}
