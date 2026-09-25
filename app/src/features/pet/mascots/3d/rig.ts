import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  Object3D,
  Quaternion,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { MascotMood } from '../roster';

/**
 * The shared rig — the 3D counterpart of `face.tsx`, and everything else the
 * five mascots have in common: one toon material, a handful of soft
 * primitives, a face that knows the three moods, and the hinges the idle loop
 * turns.
 *
 * Every builder speaks the old drawings' language. `P(sx, sy)` takes a point
 * in the SVGs' `0 0 100 100` viewBox and `S(n)` a length in it, so a mascot's
 * proportions port straight across from its drawing — the same head, the same
 * eyes, the same spacing — and a reader can hold the two files side by side.
 *
 * Nothing here is loaded, fetched or baked into an image. Every surface is
 * geometry plus one shader, so the character carries no asset and no
 * third-party artwork, the same property the SVGs had. See NOTICE.md.
 */

export type Vec3 = [number, number, number];

/** A viewBox point as model space: centred, y up, `z` already in model units. */
export function P(sx: number, sy: number, z = 0): Vec3 {
  return [(sx - 50) / 50, (50 - sy) / 50, z];
}

/** A viewBox length as model units. */
export function S(n: number): number {
  return n / 50;
}

// ---- colour -----------------------------------------------------------------

/** The palette roles a mascot may paint with, and the token behind each. */
export const ROLE_VARS = {
  text: '--color-text',
  accent: '--color-accent',
  muted: '--color-text-muted',
  base: '--color-base',
  danger: '--color-danger',
  success: '--color-success',
} as const;

/**
 * `light` is the one colour no palette controls: the catchlight in an eye.
 * It is a light source, not a tint — the same argument `Mochi.tsx` makes for
 * its highlights — and it is near-white, because nothing here paints #fff.
 */
export type Role = keyof typeof ROLE_VARS | 'light';
export const THEMED = Object.keys(ROLE_VARS) as (keyof typeof ROLE_VARS)[];
const LIGHT: Vec3 = [0.992, 0.988, 0.984];

export interface PaintOptions {
  /** Below 1 the part is see-through, like the SVGs' `opacity`. */
  opacity?: number;
  /** A second role mixed in, and how far: `['text', 0.3]`. */
  mix?: [Role, number];
  /** Strength of the soft highlight. 0 is matte; eyes and horns go glossy. */
  shine?: number;
}

export type Paint = (role: Role, options?: PaintOptions) => ShaderMaterial;

export interface Paints {
  /** One live vector per role, sRGB 0..1. Every material reads these. */
  colors: Record<Role, Vector3>;
  paint: Paint;
  dispose(): void;
}

const VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Cel shading with the edge taken off.
 *
 * A hard two-tone cut is the look the brief ruled out, so the terminator is a
 * smoothstep a third of the sphere wide: the form reads as lit and shadowed at
 * a glance without the shadow becoming a sticker. Three lights, fixed in view
 * space so they hold still while the pet turns under them:
 *
 * - key, above and to the left — where the SVGs' highlights already put it;
 * - fill, which is the shadow colour itself, the surface darkened and leaned a
 *   little toward the palette's accent so shade is warm rather than grey;
 * - rim, from behind on the right, only at grazing angles and never to full
 *   strength, so a thin tail or a horn catches an edge without blowing out to
 *   a white outline.
 *
 * Colours arrive and leave as sRGB and nothing converts them in between. That
 * is deliberate: the lit face of a part is exactly the CSS colour the palette
 * named, which is the only way "matches the theme" stays true in ten palettes.
 * The highlight is near-white, not white — nothing in this app paints #fff.
 */
const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uMix;
uniform float uMixAmount;
uniform vec3 uAccent;
uniform float uOpacity;
uniform float uShine;
varying vec3 vNormal;
varying vec3 vView;
const vec3 KEY = vec3(-0.45, 0.62, 0.64);
const vec3 RIM = vec3(0.72, 0.3, -0.62);
const vec3 LIGHT = vec3(0.992, 0.988, 0.984);
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  vec3 key = normalize(KEY);
  vec3 base = mix(uColor, uMix, uMixAmount);

  float lit = smoothstep(-0.12, 0.34, dot(n, key));
  vec3 shade = base * mix(vec3(0.64), uAccent, 0.22);
  vec3 col = mix(shade, base, lit);

  float fresnel = 1.0 - max(dot(n, v), 0.0);
  float rim = smoothstep(0.55, 0.92, fresnel) * smoothstep(-0.3, 0.5, dot(n, normalize(RIM)));
  vec3 rimColor = mix(mix(base, uAccent, 0.35), LIGHT, 0.45);
  col = mix(col, rimColor, rim * 0.5);

  float spec = smoothstep(0.9, 0.975, dot(n, normalize(key + v))) * uShine;
  col = mix(col, LIGHT, spec * 0.5);

  gl_FragColor = vec4(col, uOpacity);
}
`;

/**
 * A mascot's materials, keyed so that ten parts in the same paint share one.
 *
 * Per mascot rather than global because a dye is per mascot: the Shop's
 * swatches set `--color-accent` on each swatch, and six swatches on one screen
 * are six different birds.
 */
export function paints(): Paints {
  const colors = {
    ...Object.fromEntries(THEMED.map((r) => [r, new Vector3(0.5, 0.5, 0.5)])),
    light: new Vector3(...LIGHT),
  } as Record<Role, Vector3>;
  const made = new Map<string, ShaderMaterial>();

  const paint: Paint = (role, { opacity = 1, mix, shine = 0.14 } = {}) => {
    const key = `${role}|${opacity}|${mix?.join(':') ?? ''}|${shine}`;
    const found = made.get(key);
    if (found) return found;
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        // The same Vector3 objects, not copies: repainting a role is one write.
        uColor: { value: colors[role] },
        uMix: { value: colors[mix?.[0] ?? role] },
        uMixAmount: { value: mix?.[1] ?? 0 },
        uAccent: { value: colors.accent },
        uOpacity: { value: opacity },
        uShine: { value: shine },
      },
      transparent: opacity < 1,
      depthWrite: opacity >= 1,
      side: DoubleSide,
    });
    made.set(key, material);
    return material;
  };

  return {
    colors,
    paint,
    dispose() {
      for (const m of made.values()) m.dispose();
      made.clear();
    },
  };
}

// ---- geometry ---------------------------------------------------------------

/**
 * Geometry is shared by every mascot on screen, keyed by the arguments that
 * made it. The Shop shows one bird per dye; it builds the bird's shapes once.
 */
const shapes = new Map<string, BufferGeometry>();
function shared(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = shapes.get(key);
  if (!g) {
    g = make();
    shapes.set(key, g);
  }
  return g;
}

const SPHERE = (): BufferGeometry => shared('sphere', () => new SphereGeometry(1, 40, 28));

/** A mesh placed and scaled in one call. `rot` is Euler XYZ, radians. */
export function part(
  geometry: BufferGeometry,
  material: ShaderMaterial,
  at: Vec3,
  scale: Vec3 = [1, 1, 1],
  rot: Vec3 = [0, 0, 0],
): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(...at);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  return m;
}

/** An ellipsoid — the unit of every body in this file. Radii in model units. */
export function blob(material: ShaderMaterial, at: Vec3, radii: Vec3, rot?: Vec3): Mesh {
  return part(SPHERE(), material, at, radii, rot);
}

/**
 * A cone with its point rounded off: ears, horns, bow loops, fins.
 * Unit sized, base at y = 0 and tip at y = 1, so `scale` is `[r, h, depth]`.
 */
export function softCone(): BufferGeometry {
  return shared('cone', () => {
    const profile: Vector2[] = [new Vector2(0, 0)];
    for (let i = 0; i <= 16; i += 1) {
      const t = i / 16;
      // Fat through the middle, rounded at both ends, no sharp tip anywhere.
      const r = Math.pow(1 - t, 0.8) * (1 - 0.15 * t) * Math.min(1, 0.7 + t * 3);
      profile.push(new Vector2(Math.max(r, 0.02), t));
    }
    profile.push(new Vector2(0, 1.02));
    return new LatheGeometry(profile, 28);
  });
}

/** A lathe from a profile of `[radius, y]` pairs, in model units. */
export function turned(key: string, profile: [number, number][]): BufferGeometry {
  return shared(`lathe|${key}`, () => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 32));
}

/**
 * A tube along a smooth curve, fat at the start and thin at the end: tails,
 * whiskers, mane locks, a serpent's whole body.
 *
 * `TubeGeometry` only makes constant tubes, so each ring is pulled toward its
 * own centre afterwards. Rings are laid at `getPointAt(i / segments)`, the
 * same parameter the tube itself used, so the centre is exact.
 */
export function tube(points: Vec3[], from: number, to = from, segments = 48): BufferGeometry {
  return shared(`tube|${JSON.stringify(points)}|${from}|${to}|${segments}`, () => {
    const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
    const radial = 14;
    const g = new TubeGeometry(curve, segments, 1, radial, false);
    const pos = g.attributes.position;
    const centre = new Vector3();
    const v = new Vector3();
    for (let i = 0; i <= segments; i += 1) {
      const u = i / segments;
      curve.getPointAt(u, centre);
      // Eased so a tail stays full, then tapers — not a straight cone.
      const r = from + (to - from) * Math.pow(u, 1.4);
      for (let j = 0; j <= radial; j += 1) {
        const k = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, k).sub(centre).multiplyScalar(r).add(centre);
        pos.setXYZ(k, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}

/**
 * A rounded slab — a cube pushed toward a sphere. Marigold is one, and so is
 * nothing else, but it belongs with the other primitives rather than in her
 * file because it is geometry, not character.
 */
export function slab(roundness = 0.32): BufferGeometry {
  return shared(`slab|${roundness}`, () => {
    const g = new SphereGeometry(1, 48, 36);
    const pos = g.attributes.position;
    const v = new Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      pos.setXYZ(i, squarish(v.x, roundness), squarish(v.y, roundness), squarish(v.z, roundness));
    }
    g.computeVertexNormals();
    return g;
  });
}

function squarish(c: number, e: number): number {
  return Math.sign(c) * Math.pow(Math.abs(c), e);
}

/** An arc of a ring, symmetric about +y: a happy eye, a smile when turned over. */
function arcGeometry(chord: number, thickness: number): BufferGeometry {
  return shared(`arc|${chord}|${thickness}`, () => {
    const sweep = 1.9;
    const radius = chord / 2 / Math.sin(sweep / 2);
    const g = new TorusGeometry(radius, thickness, 10, 24, sweep);
    g.rotateZ((Math.PI - sweep) / 2);
    // Centre the stroke on the origin, so placing it places the stroke.
    g.translate(0, (-radius * (1 + Math.cos(sweep / 2))) / 2, 0);
    return g;
  });
}

/** A five-point star with soft edges, for Wishbell's sky and her bell. */
export function star(): BufferGeometry {
  return shared('star', () => {
    const s = new Shape();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? 1 : 0.45;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      if (i === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a));
      else s.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    const g = new ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 3 });
    g.center();
    return g;
  });
}

// ---- hinges -----------------------------------------------------------------

/**
 * A hinge at `at`, and a frame inside it that takes absolute coordinates.
 *
 * Returns `[hinge, frame]`: rotate the hinge, add parts to the frame at the
 * same `P(...)` points the drawing used. Without the frame every part hung on
 * a hinge would have to be written relative to it, and the side-by-side
 * reading of drawing and model would be gone.
 */
export function hinge(parent: Object3D, at: Vec3): [Group, Group] {
  const h = new Group();
  h.position.set(...at);
  parent.add(h);
  const frame = new Group();
  frame.position.set(-at[0], -at[1], -at[2]);
  h.add(frame);
  return [h, frame];
}

/** What a builder hands the engine: a figure, and the handles the idle loop turns. */
export interface Rig {
  /** Turned and lifted as a whole. */
  root: Group;
  /** Breathes: scaled about the feet, like the SVG's `transform-origin: 50% 88%`. */
  body: Group;
  /** Where the builder adds parts, in absolute model coordinates. */
  stage: Group;
  /** Tilts and nods. Absent on a mascot with no neck to speak of. */
  head?: Group;
  /** Hinged parts and each one's share of the sway. */
  sway: [Object3D, number][];
  /** Drift up and down on their own: bubbles, clouds, stars. */
  floaters: Object3D[];
  /** Squash on a blink. */
  lids: Object3D[];
  faces: Record<MascotMood, Group>;
  /** How much of the pose's bob this figure takes. A flier takes more. */
  lift: number;
  /** How much it swells on a breath. A sponge is squishier than a cat. */
  squish: number;
}

/** Feet sit here in every drawing, give or take: y = 88 in viewBox units. */
const GROUND = P(50, 94)[1];

export function newRig(): Rig {
  const root = new Group();
  const [body, stage] = hinge(root, [0, GROUND, 0]);
  const faces = { happy: new Group(), content: new Group(), sleepy: new Group() };
  return { root, body, stage, sway: [], floaters: [], lids: [], faces, lift: 1, squish: 1 };
}

/** Marks a part as a floater and remembers where it rests. */
export function float<T extends Object3D>(rig: Rig, o: T): T {
  o.userData.y = o.position.y;
  rig.floaters.push(o);
  return o;
}

// ---- faces ------------------------------------------------------------------

/** Where a face sits: a point on the head's surface and which way it faces. */
export type Surface = (x: number, y: number) => { at: Vec3; normal: Vector3 };

/** The front of an ellipsoid head. `x, y` in model units. */
export function ellipsoid(centre: Vec3, radii: Vec3): Surface {
  return (x, y) => {
    const u = (x - centre[0]) / radii[0];
    const v = (y - centre[1]) / radii[1];
    const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    return {
      at: [x, y, centre[2] + radii[2] * w],
      normal: new Vector3(u / radii[0], v / radii[1], w / radii[2]).normalize(),
    };
  };
}

/** The front of a `slab()`, which is flat until it rounds over at the edges. */
export function slabFront(centre: Vec3, radii: Vec3, roundness = 0.32): Surface {
  const n = 2 / roundness;
  return (x, y) => {
    const u = Math.abs((x - centre[0]) / radii[0]);
    const v = Math.abs((y - centre[1]) / radii[1]);
    const w = Math.pow(Math.max(0, 1 - Math.pow(u, n) - Math.pow(v, n)), 1 / n);
    return {
      at: [x, y, centre[2] + radii[2] * w],
      normal: new Vector3(
        (Math.sign(x - centre[0]) * Math.pow(u, n - 1)) / radii[0],
        (Math.sign(y - centre[1]) * Math.pow(v, n - 1)) / radii[1],
        Math.pow(w, n - 1) / radii[2],
      ).normalize(),
    };
  };
}

/**
 * Several surfaces as one, the nearest to the camera winning at each point.
 * A face that spans a head and a snout — the fox's mouth is on its muzzle,
 * its eyes on its skull — sits on whichever is in front.
 */
export function union(...surfaces: Surface[]): Surface {
  return (x, y) => surfaces.map((s) => s(x, y)).reduce((a, b) => (b.at[2] > a.at[2] ? b : a));
}

const FORWARD = new Vector3(0, 0, 1);

/** Sits `o` on the surface, facing out along it, lifted `out` above it. */
export function onSurface<T extends Object3D>(surface: Surface, o: T, x: number, y: number, out = 0): T {
  const { at, normal } = surface(x, y);
  o.position.set(at[0] + normal.x * out, at[1] + normal.y * out, at[2] + normal.z * out);
  o.quaternion.copy(new Quaternion().setFromUnitVectors(FORWARD, normal));
  return o;
}

export interface FaceSpec {
  /** Midpoint between the eyes, spread to each, eye radius — viewBox units, as `<Eyes>`. */
  eyes: { cx: number; cy: number; spread: number; r: number };
  /** As `<Mouth>`: centre and the widest mouth this face wants. */
  mouth: { cx: number; cy: number; w: number };
  /** As `<Blush>`. Left out on the faces that never had it. */
  blush?: { cx: number; cy: number; spread: number; r: number };
}

/**
 * Three faces built once, one shown at a time — `face.tsx` in the round.
 *
 * The rules come across unchanged: happy eyes are upward arcs, sleepy ones are
 * lids, content ones are the only filled eyes and so the only ones with a
 * catchlight and the only ones that blink. No face frowns.
 */
export function face(rig: Rig, parent: Object3D, paint: Paint, surface: Surface, spec: FaceSpec): void {
  const ink = paint('base', { shine: 1 });
  const light = paint('light', { shine: 0 });
  const { eyes, mouth, blush } = spec;

  for (const side of [-1, 1]) {
    const x = S(eyes.cx - 50 + side * eyes.spread);
    const y = -S(eyes.cy - 50);
    const r = S(eyes.r);

    // content: a filled oval with a catchlight, hung on a lid that blinks.
    const lid = onSurface(surface, new Group(), x, y, r * 0.05);
    lid.add(blob(ink, [0, 0, 0], [r * 0.68, r * 0.9, r * 0.42]));
    lid.add(blob(light, [-r * 0.28, r * 0.32, r * 0.36], [r * 0.2, r * 0.2, r * 0.1]));
    rig.lids.push(lid);
    rig.faces.content.add(lid);

    const arc = arcGeometry(r * 2, r * 0.3);
    rig.faces.happy.add(onSurface(surface, new Mesh(arc, ink), x, y + r * 0.1, r * 0.2));
    const shut = onSurface(surface, new Mesh(arc, ink), x, y - r * 0.1, r * 0.2);
    shut.rotateZ(Math.PI);
    rig.faces.sleepy.add(shut);

    if (blush) {
      const b = onSurface(surface, blob(paint('danger', { opacity: 0.4, shine: 0 }), [0, 0, 0], [S(blush.r), S(blush.r) * 0.66, S(blush.r) * 0.2]),
        S(blush.cx - 50 + side * blush.spread), -S(blush.cy - 50), S(0.3));
      // Blush is the same in every mood that has it; sleep has nothing to blush about.
      rig.faces.happy.add(b);
      rig.faces.content.add(b.clone());
    }
  }

  const mx = S(mouth.cx - 50);
  const my = -S(mouth.cy - 50);
  const stroke = S(mouth.w) * 0.08;
  const smile = (w: number) => {
    const m = onSurface(surface, new Mesh(arcGeometry(S(w), stroke), ink), mx, my, stroke);
    m.rotateZ(Math.PI);
    return m;
  };
  rig.faces.happy.add(smile(mouth.w));
  rig.faces.content.add(smile(mouth.w * 0.6));
  rig.faces.sleepy.add(onSurface(surface, blob(ink, [0, 0, 0], [S(mouth.w) * 0.16, S(mouth.w) * 0.2, stroke]), mx, my, 0));

  for (const f of Object.values(rig.faces)) parent.add(f);
}
