import { Mesh } from 'three';
import {
  P, S, blob, ellipsoid, face, float, hinge, newRig, onSurface, part, softCone, star, tube, turned, union,
  type Paint, type Rig, type Vec3,
} from './rig';

/** A bell, turned: flared lip at the bottom, domed crown at the top. Unit height. */
const BELL: [number, number][] = [
  [0, 0], [0.92, 0], [1, 0.08], [0.86, 0.22], [0.66, 0.55], [0.58, 0.8], [0.4, 0.97], [0, 1],
];

/**
 * Wishbell in the round — the lilac unicorn from `../Wishbell.tsx`: the horn
 * with its ridges, the two-colour mane falling both sides, the bell with her
 * star on it, two stars in the sky. The drawing was a bust; in the round she
 * gets the small body and four short legs the rest of the roster has, which
 * makes her the busiest figure of the five and the rig's test of whether
 * part-count stays cheap.
 *
 * Original geometry, not anybody's character; see NOTICE.md.
 */
export function wishbell(paint: Paint): Rig {
  const rig = newRig();
  const coat = paint('accent');
  const muzzle = paint('accent', { mix: ['text', 0.14] });
  const hoof = paint('accent', { mix: ['text', 0.45] });
  const ridge = paint('accent', { mix: ['text', 0.45], shine: 0.6 });
  const pink = paint('danger', { shine: 0.3 });
  const green = paint('success', { shine: 0.3 });
  const brass = paint('text', { shine: 1 });
  const nostril = paint('accent', { mix: ['base', 0.5], shine: 0 });

  // Body and legs, the back pair set behind the front.
  rig.stage.add(blob(coat, P(50, 80, -0.14), [S(18), S(11), S(16)]));
  for (const [x, z, top] of [[38, -0.34, 82], [62, -0.34, 82], [42, 0.06, 84], [58, 0.06, 84]] as const) {
    rig.stage.add(new Mesh(tube([P(x, top, z), P(x, 95, z + 0.02)], S(3.8), S(3.4)), coat));
    rig.stage.add(blob(hoof, P(x, 95.5, z + 0.02), [S(4.2), S(2.2), S(4.2)]));
  }

  const [tail, tailFrame] = hinge(rig.stage, P(66, 78, -0.36));
  tailFrame.add(new Mesh(tube([P(65, 77, -0.36), P(78, 74, -0.42), P(85, 84, -0.38), P(82, 94, -0.3)], S(3.6), S(1.2)), pink));
  tailFrame.add(new Mesh(tube([P(66, 79, -0.4), P(76, 79, -0.48), P(80, 88, -0.44), P(76, 96, -0.36)], S(3), S(1)), green));
  rig.sway.push([tail, 0.6]);

  const HEAD = P(50, 48, 0.12);
  const R: Vec3 = [S(22), S(20), S(20)];
  const SNOUT = P(50, 60, 0.38);
  const SR: Vec3 = [S(13), S(9), S(8)];
  const [neck, head] = hinge(rig.stage, P(50, 70));
  rig.head = neck;
  head.add(blob(coat, HEAD, R));
  head.add(blob(muzzle, SNOUT, SR));
  const skin = union(ellipsoid(HEAD, R), ellipsoid(SNOUT, SR));

  for (const side of [-1, 1]) {
    const x = 50 + side * 14;
    const [ear, earFrame] = hinge(head, P(x, 34, 0.02));
    earFrame.add(part(softCone(), coat, P(x, 34, 0.02), [S(7), S(17), S(4)], [0, 0, -side * 0.42]));
    earFrame.add(part(softCone(), paint('danger', { mix: ['accent', 0.4] }), P(x + side * 0.4, 33, 0.06), [S(4), S(11), S(2.4)], [0, 0, -side * 0.42]));
    rig.sway.push([ear, 0.1 * side]);

    // The mane: two locks each side, pink over green on the left, swapped on
    // the right — the drawing's order, so the two colours still alternate.
    const [outer, inner] = side < 0 ? [pink, green] : [green, pink];
    head.add(new Mesh(tube([P(50 + side * 8, 29, 0.02), P(50 + side * 21, 38, -0.04), P(50 + side * 25, 56, -0.06), P(50 + side * 23, 72, -0.12)], S(5.2), S(1.8)), outer));
    head.add(new Mesh(tube([P(50 + side * 5, 30, -0.12), P(50 + side * 16, 42, -0.16), P(50 + side * 20, 58, -0.16), P(50 + side * 17, 70, -0.2)], S(4.6), S(1.6)), inner));
  }

  // The forelock, over the brow and in front of the horn's root.
  head.add(new Mesh(tube([P(38, 36, 0.26), P(44, 30, 0.34), P(53, 29, 0.35), P(60, 33, 0.3)], S(4), S(2)), pink));
  head.add(new Mesh(tube([P(48, 31, 0.33), P(56, 29, 0.33), P(63, 35, 0.26)], S(3), S(1.4)), green));

  // The horn, and a ridge winding up it.
  head.add(part(softCone(), paint('accent', { shine: 1 }), P(50, 33, 0.14), [S(5), S(27), S(5)]));
  const helix: Vec3[] = [];
  for (let k = 0; k <= 40; k += 1) {
    const t = k / 40;
    const r = S(5) * (1 - t * 0.82) * 0.98;
    const a = t * Math.PI * 5.5;
    helix.push([r * Math.cos(a), P(50, 31 - 22 * t)[1], 0.14 + r * Math.sin(a)]);
  }
  head.add(new Mesh(tube(helix, S(0.9), S(0.5), 96), ridge));

  face(rig, head, paint, skin, {
    eyes: { cx: 50, cy: 47, spread: 10, r: 5 },
    mouth: { cx: 50, cy: 66, w: 11 },
    blush: { cx: 50, cy: 56, spread: 15, r: 4.8 },
  });
  for (const side of [-1, 1]) {
    head.add(onSurface(skin, blob(nostril, [0, 0, 0], [S(1.6), S(2), S(0.6)]), side * S(4.5), P(50, 61.5)[1], 0));
  }

  // The bell in her mane, with her star on it.
  const bellAt = P(27, 74, 0.02);
  head.add(part(turned('bell', BELL), brass, bellAt, [S(6), S(8.5), S(6)]));
  head.add(blob(brass, [bellAt[0], bellAt[1] - S(1.2), bellAt[2]], [S(1.8), S(1.8), S(1.8)]));
  head.add(part(star(), paint('accent', { shine: 0.6 }), [bellAt[0], bellAt[1] + S(4), bellAt[2] + S(4.8)], [S(2.8), S(2.8), S(2.8)]));

  const sky = paint('text', { opacity: 0.35, shine: 0.6 });
  rig.root.add(float(rig, part(star(), sky, P(14, 18, -0.3), [S(4.5), S(4.5), S(4.5)], [0, 0.3, 0.2])));
  rig.root.add(float(rig, part(star(), sky, P(87, 14, -0.3), [S(3.5), S(3.5), S(3.5)], [0, -0.3, -0.15])));

  return rig;
}
