import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { MascotMood } from '../roster';
import { buildMascot } from './models';
import { pose, REST_YAW } from './pose';
import { paints, ROLE_VARS, THEMED, type Paints, type Rig } from './rig';

/**
 * The 3D mascots' renderer — one WebGL context for every pet on screen.
 *
 * Onboarding shows five mascots and the Shop one per dye, so a canvas each
 * would be ten contexts on one page, against a browser limit of about sixteen
 * that Phaser also draws from. Instead there is one hidden renderer: each pet
 * is drawn into a corner of it and copied onto the pet's own 2D canvas, all in
 * the same frame. The pets are small, so the copy is cheap.
 *
 * The context lives exactly as long as some mascot is mounted. When the last
 * one goes, the renderer is disposed and its context released on the spot —
 * which is what lets the Raid Gate hand over to the garden without two WebGL
 * contexts ever being alive at once: the gate's pedestals unmount in the same
 * commit the garden mounts in, and cleanups run before the garden's effects
 * can boot Phaser.
 *
 * Loaded with a dynamic `import()` and kept out of the precache, for the
 * reason Phaser is: three.js alone is larger than the precache's headroom.
 * Until it arrives — or if it never does, offline or without WebGL — the SVG
 * drawing is what shows. See `Mascot3D.tsx`.
 */

export interface MascotHandle {
  setMood(mood: MascotMood): void;
  dispose(): void;
}

interface Instance {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scene: Scene;
  rig: Rig;
  paints: Paints;
  mood: MascotMood;
  /** Backing size in device pixels. */
  w: number;
  h: number;
  visible: boolean;
  /** Needs a draw even if nothing is moving. */
  dirty: boolean;
  /** Colours need reading again. */
  stale: boolean;
  shown: boolean;
  /** So a row of the same bird does not breathe in lockstep. */
  offset: number;
  onReady(ok: boolean): void;
}

/** Anchored to the page, not the mount — see the note on `useCanvasLoop`'s EPOCH. */
const EPOCH = performance.now();
/** Idle motion at 30 fps: plenty for breathing, and half the GPU of 60. */
const FRAME_MS = 1000 / 30;
/** Retina is worth it; 3× is not, at these sizes. */
const MAX_DPR = 2;
/** Vertical field of view, degrees, that fits the 2-unit frame from `DISTANCE`. */
const FOV = 25;
const DISTANCE = 5;

const live = new Map<HTMLCanvasElement, Instance>();
let renderer: WebGLRenderer | null = null;
let camera: PerspectiveCamera | null = null;
let raf = 0;
let lastFrame = 0;
let resize: ResizeObserver | null = null;
let seen: IntersectionObserver | null = null;
let watch: MutationObserver | null = null;

function start(): boolean {
  if (renderer) return true;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    // No WebGL — an old phone, a locked-down browser, a test. The SVG stays.
    return false;
  }
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  renderer.domElement.addEventListener('webglcontextlost', () => {
    // The GPU took it back. Everybody falls back to their drawing; the next
    // mascot to mount asks for a fresh context.
    for (const inst of live.values()) {
      inst.shown = false;
      inst.onReady(false);
    }
    stop(false);
  });
  camera = new PerspectiveCamera(FOV, 1, 0.1, 20);
  camera.position.set(0, 0.45, DISTANCE);
  camera.lookAt(0, 0.02, 0);

  resize = new ResizeObserver((entries) => {
    for (const e of entries) {
      const inst = live.get(e.target as HTMLCanvasElement);
      if (inst) fit(inst);
    }
    kick();
  });
  seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const inst = live.get(e.target as HTMLCanvasElement);
      if (inst) {
        inst.visible = e.isIntersecting;
        inst.dirty = true;
      }
    }
    kick();
  });
  // A theme, a palette mode, calm, or a dye on some ancestor: all of them are
  // an attribute write somewhere above a mascot. The callback only raises a
  // flag; the colours are read on the next frame, once per pet.
  watch = new MutationObserver(() => {
    for (const inst of live.values()) inst.stale = true;
    kick();
  });
  watch.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['style', 'data-theme', 'data-mode', 'data-calm'],
  });
  // Pets that outlived a lost context are still mounted; watch them again.
  for (const canvas of live.keys()) {
    resize.observe(canvas);
    seen.observe(canvas);
  }
  return true;
}

function stop(release: boolean): void {
  cancelAnimationFrame(raf);
  raf = 0;
  resize?.disconnect();
  seen?.disconnect();
  watch?.disconnect();
  resize = seen = watch = null;
  if (renderer) {
    renderer.dispose();
    // Given back now, not whenever the collector gets round to it.
    if (release) renderer.forceContextLoss();
  }
  renderer = null;
  camera = null;
}

function fit(inst: Instance): void {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = Math.round(inst.canvas.clientWidth * dpr);
  const h = Math.round(inst.canvas.clientHeight * dpr);
  if (w === inst.w && h === inst.h) return;
  inst.w = inst.canvas.width = w;
  inst.h = inst.canvas.height = h;
  inst.dirty = true;
}

function calmNow(): boolean {
  // `applyTheme` writes calm mode and reduced motion onto the root as one flag.
  return document.documentElement.dataset.calm === 'true'
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

// ---- colour -----------------------------------------------------------------

let probe: CanvasRenderingContext2D | null = null;
const resolved = new Map<string, [number, number, number]>();

/**
 * Any CSS colour as sRGB bytes, by painting one pixel with it.
 *
 * A custom property's computed value is its text, not a colour: a dye is a
 * hex, but `--color-accent-live` is a `color-mix()`, and a future palette may
 * be anything the browser can paint. Painting it is the one parser that
 * agrees with the stylesheet on every one of them.
 */
function toRgb(css: string): [number, number, number] | null {
  const cached = resolved.get(css);
  if (cached) return cached;
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = 'transparent'; // so a colour the browser rejects cannot inherit the last one
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  const rgb: [number, number, number] = [r / 255, g / 255, b / 255];
  resolved.set(css, rgb);
  return rgb;
}

/**
 * Read from the pet's own canvas, not the root: a dye is a set of custom
 * properties on a wrapper around one pet, and the root has never heard of it.
 */
function readColors(inst: Instance): void {
  const style = getComputedStyle(inst.canvas);
  for (const role of THEMED) {
    const css = style.getPropertyValue(ROLE_VARS[role]).trim();
    const rgb = css ? toRgb(css) : null;
    if (rgb) inst.paints.colors[role].set(...rgb);
  }
  inst.stale = false;
  inst.dirty = true;
}

// ---- the loop ---------------------------------------------------------------

function kick(): void {
  if (!raf && renderer) raf = requestAnimationFrame(tick);
}

function tick(now: number): void {
  raf = 0;
  if (!renderer) return;
  const calm = calmNow();
  const due = now - lastFrame >= FRAME_MS - 1;
  let moving = false;

  for (const inst of live.values()) {
    if (!inst.visible || inst.w === 0 || inst.h === 0) continue;
    if (inst.stale) readColors(inst);
    if (!calm) moving = true;
    if (inst.dirty || (!calm && due)) draw(inst, (now - EPOCH) / 1000 + inst.offset, calm);
  }
  if (due) lastFrame = now;
  // Calm draws once and stops asking. Nothing on screen, nothing asked either.
  if (moving) raf = requestAnimationFrame(tick);
}

const MOODS: MascotMood[] = ['happy', 'content', 'sleepy'];

function draw(inst: Instance, t: number, calm: boolean): void {
  const gl = renderer!;
  const cam = camera!;
  const { rig, w, h } = inst;
  const p = pose(inst.mood, t, calm);

  rig.root.position.y = p.bob * rig.lift;
  rig.root.rotation.y = REST_YAW + p.yaw;
  const swell = p.breath * rig.squish;
  rig.body.scale.set(1 + swell * 0.02, 1 + swell * 0.035, 1 + swell * 0.02);
  if (rig.head) rig.head.rotation.set(p.nod, 0, p.tilt);
  for (const [o, gain] of rig.sway) o.rotation.z = p.sway * gain;
  rig.floaters.forEach((o, i) => {
    o.position.y = o.userData.y + (calm ? 0 : 0.035 * Math.sin(t * 1.1 + i * 2.1));
  });
  for (const lid of rig.lids) lid.scale.y = 1 - 0.92 * p.blink;
  for (const m of MOODS) rig.faces[m].visible = m === inst.mood;

  // Fit the frame the way `viewBox` + `meet` did: the whole 2×2 square shows,
  // whatever shape the box is.
  const aspect = w / h;
  cam.aspect = aspect;
  cam.fov = aspect >= 1 ? FOV : (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) / aspect) * 180) / Math.PI;
  cam.updateProjectionMatrix();

  const out = gl.domElement;
  if (out.width < w || out.height < h) gl.setSize(Math.max(out.width, w), Math.max(out.height, h), false);
  gl.setViewport(0, 0, w, h);
  gl.setScissor(0, 0, w, h);
  gl.clear();
  gl.render(inst.scene, cam);
  // WebGL counts rows from the bottom, the 2D canvas from the top.
  inst.ctx.clearRect(0, 0, w, h);
  inst.ctx.drawImage(out, 0, out.height - h, w, h, 0, 0, w, h);

  inst.dirty = false;
  if (!inst.shown) {
    inst.shown = true;
    inst.onReady(true);
  }
}

// ---- mounting ---------------------------------------------------------------

/**
 * Starts drawing `themeId`'s mascot into `canvas`. Returns null when there is
 * no WebGL to draw with, and the caller keeps its SVG.
 */
export function mount(
  canvas: HTMLCanvasElement,
  themeId: string,
  mood: MascotMood,
  onReady: (ok: boolean) => void,
): MascotHandle | null {
  const ctx = canvas.getContext('2d');
  if (!ctx || !start()) return null;

  const p = paints();
  const rig = buildMascot(themeId, p.paint);
  const scene = new Scene();
  scene.add(rig.root);

  const inst: Instance = {
    canvas, ctx, scene, rig, paints: p, mood,
    w: 0, h: 0, visible: true, dirty: true, stale: true, shown: false,
    offset: Math.random() * 20,
    onReady,
  };
  live.set(canvas, inst);
  fit(inst);
  resize!.observe(canvas);
  seen!.observe(canvas);
  kick();

  return {
    setMood(next) {
      if (next === inst.mood) return;
      inst.mood = next;
      inst.dirty = true;
      kick();
    },
    dispose() {
      if (!live.delete(canvas)) return;
      resize?.unobserve(canvas);
      seen?.unobserve(canvas);
      p.dispose();
      if (live.size === 0) stop(true);
    },
  };
}
