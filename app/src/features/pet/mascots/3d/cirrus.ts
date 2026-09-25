import { Group, Mesh } from 'three';
import {
  P, S, blob, ellipsoid, face, float, hinge, newRig, part, softCone, tube,
  type Paint, type Rig, type Vec3,
} from './rig';

/** The cloud puffs from `../Cirrus.tsx`: viewBox centre and radius. */
const PUFFS = [
  { cx: 12, cy: 22, r: 10 },
  { cx: 92, cy: 62, r: 8 },
  { cx: 20, cy: 92, r: 7 },
];

/**
 * Cirrus in the round — the cloud serpent from `../Cirrus.tsx`: a round head
 * with swept-back fins and a curl on the brow, and one long body coiling away
 * underneath it. The first mascot that does not stand: it hovers, so it takes
 * more of the bob than the others and its whole coil sways under the head.
 *
 * The body is one tapering tube along the drawing's own stroke, pushed in and
 * out of the page so the coil passes in front of itself.
 *
 * Original geometry, not anybody's character; see NOTICE.md.
 */
export function cirrus(paint: Paint): Rig {
  const rig = newRig();
  rig.lift = 2.6;
  const scales = paint('accent', { shine: 0.3 });
  const fin = paint('accent', { mix: ['text', 0.22] });
  const ink = paint('text', { shine: 0.4 });
  const cloud = paint('text', { opacity: 0.42, shine: 0 });

  const [coil, coilFrame] = hinge(rig.stage, P(50, 58));
  coilFrame.add(new Mesh(tube([
    P(50, 54, -0.05), P(70, 62, -0.22), P(77, 78, -0.12), P(63, 90, 0.08),
    P(44, 92, 0.1), P(30, 84, -0.04), P(30, 72, -0.26), P(39, 65, -0.42),
  ], S(7.5), S(1.6), 64), scales));
  coilFrame.add(blob(fin, P(40, 64.5, -0.43), [S(3.5), S(2.5), S(2.5)]));
  rig.sway.push([coil, 0.35]);

  const HEAD = P(50, 40, 0.1);
  const R: Vec3 = [S(25), S(22), S(21)];
  const [neck, head] = hinge(rig.stage, P(50, 58));
  rig.head = neck;
  head.add(blob(scales, HEAD, R));
  const skin = ellipsoid(HEAD, R);

  for (const side of [-1, 1]) {
    const [f, finFrame] = hinge(head, P(50 + side * 20, 34, -0.02));
    finFrame.add(part(softCone(), fin, P(50 + side * 20, 34, -0.02), [S(8), S(20), S(3.5)], [0, -side * 0.3, -side * 1.05]));
    rig.sway.push([f, 0.18 * side]);

    // Two long barbels from the cheeks, trailing out and up.
    head.add(new Mesh(tube([P(50 + side * 12, 50, 0.4), P(50 + side * 25, 55, 0.36), P(50 + side * 36, 50, 0.28), P(50 + side * 40, 43, 0.22)], S(1.2), S(0.5)), ink));
  }

  // The curl on the brow, laid on the skull so it follows the curve.
  const curl: Vec3[] = [];
  for (let k = 0; k <= 12; k += 1) {
    const a = k * 0.55;
    const r = 5.2 - k * 0.34;
    const [x, y] = P(52 + r * Math.cos(a), 28.5 - r * Math.sin(a));
    const { at } = skin(x, y);
    curl.push([at[0], at[1], at[2] + S(0.6)]);
  }
  head.add(new Mesh(tube(curl, S(1.4), S(0.9)), ink));

  face(rig, head, paint, skin, {
    eyes: { cx: 50, cy: 41, spread: 11, r: 5 },
    mouth: { cx: 50, cy: 52, w: 16 },
  });

  for (const p of PUFFS) {
    const puff = new Group();
    puff.position.set(...P(p.cx, p.cy, -0.35));
    for (const [dx, dy, k] of [[0, 0, 1], [-0.9, -0.25, 0.7], [0.85, -0.3, 0.65]]) {
      puff.add(blob(cloud, [S(p.r * dx), S(p.r * dy), 0], [S(p.r * k), S(p.r * k * 0.8), S(p.r * k * 0.7)]));
    }
    rig.root.add(float(rig, puff));
  }

  return rig;
}
