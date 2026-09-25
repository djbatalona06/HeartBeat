import { Mesh } from 'three';
import {
  P, S, blob, ellipsoid, face, hinge, newRig, onSurface, part, softCone, tube,
  type Paint, type Rig, type Vec3,
} from './rig';

/**
 * Mochi in the round — the cream ribbon cat from `../Mochi.tsx`, point for
 * point: the same round head, folded ears, bow on the right ear and whiskers,
 * at the drawing's own coordinates. The tail is new; a cat you can turn a
 * little needs something behind it.
 *
 * Original geometry, not anybody's character; see NOTICE.md.
 */
export function mochi(paint: Paint): Rig {
  const rig = newRig();
  const fur = paint('text');
  const innerEar = paint('accent', { mix: ['text', 0.3] });
  const ribbon = paint('accent', { shine: 0.8 });
  const whisker = paint('muted', { shine: 0 });

  rig.stage.add(blob(fur, P(50, 79, -0.08), [S(23), S(17), S(20)]));
  for (const x of [36, 64]) rig.stage.add(blob(fur, P(x, 92, 0.24), [S(8), S(4.5), S(7)]));

  const [tail, tailFrame] = hinge(rig.stage, P(66, 88, -0.3));
  tailFrame.add(new Mesh(tube([P(64, 88, -0.3), P(80, 85, -0.44), P(87, 72, -0.42), P(82, 61, -0.32)], S(4.2), S(2.6)), fur));
  rig.sway.push([tail, 0.7]);

  const HEAD = P(50, 46, 0.12);
  const R: Vec3 = [S(30), S(25), S(24)];
  const [neck, head] = hinge(rig.stage, P(50, 68));
  rig.head = neck;
  head.add(blob(fur, HEAD, R));
  const skin = ellipsoid(HEAD, R);

  for (const side of [-1, 1]) {
    const x = 50 + side * 14.5;
    const [ear, earFrame] = hinge(head, P(x, 29, 0.02));
    earFrame.add(part(softCone(), fur, P(x, 29, 0.02), [S(10.5), S(21), S(5)], [0, 0, -side * 0.32]));
    earFrame.add(part(softCone(), innerEar, P(x + side * 0.6, 28, 0.07), [S(6.5), S(15), S(3)], [0, 0, -side * 0.32]));
    // An ear flicks a little with the sway, in opposite directions.
    rig.sway.push([ear, 0.12 * side]);

    for (const [from, to] of [[45, 41], [50, 51]]) {
      head.add(new Mesh(tube([P(50 + side * 23, from, 0.36), P(50 + side * 36, (from + to) / 2, 0.44), P(50 + side * 46, to, 0.5)], S(0.9), S(0.5)), whisker));
    }
  }

  face(rig, head, paint, skin, {
    eyes: { cx: 50, cy: 43, spread: 11, r: 5 },
    mouth: { cx: 50, cy: 58, w: 16 },
    blush: { cx: 50, cy: 53, spread: 21, r: 6 },
  });
  head.add(onSurface(skin, blob(ribbon, [0, 0, 0], [S(3.2), S(2.4), S(2.2)]), 0, P(50, 53)[1], S(0.6)));

  // The bow: two loops pointing in at a knot, sat on the right ear.
  const KNOT = P(72, 21, 0.26);
  head.add(blob(ribbon, KNOT, [S(4.5), S(4.5), S(3.5)]));
  head.add(part(softCone(), ribbon, P(58, 20, 0.22), [S(7), S(13), S(4)], [0, 0, -Math.PI / 2 - 0.1]));
  head.add(part(softCone(), ribbon, P(86, 20, 0.22), [S(7), S(13), S(4)], [0, 0, Math.PI / 2 + 0.1]));

  return rig;
}
