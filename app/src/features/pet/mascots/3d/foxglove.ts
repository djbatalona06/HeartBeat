import { Mesh, SphereGeometry } from 'three';
import {
  P, S, blob, ellipsoid, face, hinge, newRig, onSurface, part, softCone, tube, union,
  type Paint, type Rig, type Vec3,
} from './rig';

/** The headband: a slice of a slightly larger skull, between two latitudes. */
const BAND_TOP = 25;
const BAND_BOTTOM = 35;

/**
 * Foxglove in the round — the ink fox from `../Foxglove.tsx`: tall ears, a
 * pale muzzle, a cloth band across the brow with its tails in the wind, and
 * the big tail sweeping round behind. The rig's test of long, thin shapes,
 * which is where a rim light most often blows out to a white outline; it is
 * capped in the shader for exactly this.
 *
 * Original geometry, not anybody's character; see NOTICE.md.
 */
export function foxglove(paint: Paint): Rig {
  const rig = newRig();
  const coat = paint('accent');
  const pale = paint('text');
  const cloth = paint('base', { shine: 0.05 });
  const innerEar = paint('accent', { mix: ['base', 0.45] });

  // Low, behind, and thickening toward a pale tip — a brush, not a thin
  // raised tube, which from three-quarters reads as an arm holding a ball.
  const [tail, tailFrame] = hinge(rig.stage, P(40, 86, -0.32));
  tailFrame.add(new Mesh(tube([P(42, 86, -0.32), P(26, 92, -0.42), P(12, 88, -0.46), P(7, 77, -0.44)], S(4.5), S(8)), coat));
  tailFrame.add(blob(pale, P(7.5, 72, -0.44), [S(7.5), S(8.5), S(7)], [0, 0, -0.25]));
  rig.sway.push([tail, 0.55]);

  rig.stage.add(blob(coat, P(54, 76, -0.05), [S(22), S(16), S(18)]));
  rig.stage.add(blob(pale, P(54, 80, 0.16), [S(13), S(10.5), S(9)]));
  for (const x of [43, 65]) rig.stage.add(blob(coat, P(x, 92, 0.2), [S(7), S(4), S(7)]));

  const HEAD = P(54, 46, 0.1);
  const R: Vec3 = [S(27), S(24), S(22)];
  const MUZZLE = P(54, 55.5, 0.44);
  const MR: Vec3 = [S(14.5), S(11), S(9)];
  const [neck, head] = hinge(rig.stage, P(54, 66));
  rig.head = neck;
  head.add(blob(coat, HEAD, R));
  head.add(blob(pale, MUZZLE, MR));

  for (const side of [-1, 1]) {
    const x = 54 + side * 16;
    const [ear, earFrame] = hinge(head, P(x, 29, 0));
    earFrame.add(part(softCone(), coat, P(x, 29, 0), [S(10), S(23), S(5)], [0, 0, -side * 0.24]));
    earFrame.add(part(softCone(), innerEar, P(x + side * 0.4, 28, 0.05), [S(5.5), S(15), S(3)], [0, 0, -side * 0.24]));
    rig.sway.push([ear, 0.1 * side]);
  }

  // The band follows the skull exactly because it *is* the skull, a little larger.
  const top = Math.acos((46 - BAND_TOP) / 24);
  const bottom = Math.acos((46 - BAND_BOTTOM) / 24);
  const band = new Mesh(new SphereGeometry(1, 48, 6, 0, Math.PI * 2, top, bottom - top), cloth);
  band.position.set(...HEAD);
  band.scale.set(R[0] * 1.04, R[1] * 1.04, R[2] * 1.04);
  head.add(band);

  // Its two tails, knotted at the back of the head and streaming right.
  const [knot, knotFrame] = hinge(head, P(76, 31, -0.2));
  knotFrame.add(blob(cloth, P(87, 33, -0.1), [S(11), S(3.4), S(1.4)], [0, 0, -0.22]));
  knotFrame.add(blob(cloth, P(84, 42, -0.08), [S(10), S(3), S(1.4)], [0, 0, -0.62]));
  rig.sway.push([knot, -0.5]);

  const skin = union(ellipsoid(HEAD, R), ellipsoid(MUZZLE, MR));
  face(rig, head, paint, skin, {
    eyes: { cx: 54, cy: 44, spread: 11, r: 5 },
    mouth: { cx: 54, cy: 60, w: 14 },
  });
  head.add(onSurface(skin, blob(paint('base', { shine: 1 }), [0, 0, 0], [S(3.4), S(2.4), S(2.4)]), 0, P(54, 52.5)[1], S(0.8)));

  return rig;
}
