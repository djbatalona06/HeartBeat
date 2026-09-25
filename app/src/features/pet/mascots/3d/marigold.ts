import { Mesh } from 'three';
import {
  P, S, blob, face, float, newRig, onSurface, part, slab, slabFront, tube,
  type Paint, type Rig, type Vec3,
} from './rig';

/** The pores from `../Marigold.tsx`, where they were: viewBox centre and radius. */
const PORES = [
  { cx: 28, cy: 26, r: 4 },
  { cx: 71, cy: 30, r: 5.5 },
  { cx: 24, cy: 58, r: 5 },
  { cx: 76, cy: 62, r: 4 },
  { cx: 34, cy: 74, r: 3.5 },
  { cx: 62, cy: 76, r: 4.5 },
];

/** Round her side, where the three-quarter view turns it toward you. */
const SIDE_PORES = [
  { cy: 34, z: 0.05, r: 4.5 },
  { cy: 60, z: -0.18, r: 3.5 },
];

const BUBBLES = [
  { cx: 20, cy: 12, r: 3.5 },
  { cx: 82, cy: 9, r: 4.5 },
  { cx: 71, cy: 4, r: 2.5 },
];

/**
 * Marigold in the round — the sea sponge from `../Marigold.tsx`: a soft slab
 * full of holes, two legs, bubbles. She is the rig's test of a body that is
 * not a sphere, and the one who squishes most when she breathes.
 *
 * The holes are dark, flat craters rather than cut-throughs. Real holes would
 * need boolean geometry for a pet that is never seen from behind, and a
 * crater reads as a hole at every size the app shows her.
 */
export function marigold(paint: Paint): Rig {
  const rig = newRig();
  rig.squish = 2.4;
  const sponge = paint('accent', { shine: 0.08 });
  const pore = paint('accent', { mix: ['base', 0.5], shine: 0 });
  const bubble = paint('text', { opacity: 0.32, shine: 1.2 });

  const BODY = P(50, 50, 0);
  const R: Vec3 = [S(33), S(34), S(20)];
  rig.stage.add(part(slab(), sponge, BODY, R));
  const front = slabFront(BODY, R);

  for (const p of PORES) {
    rig.stage.add(onSurface(front, blob(pore, [0, 0, 0], [S(p.r), S(p.r), S(p.r) * 0.18]), S(p.cx - 50), -S(p.cy - 50), 0));
  }
  for (const p of SIDE_PORES) {
    rig.stage.add(blob(pore, [R[0] * 0.995, -S(p.cy - 50), p.z], [S(p.r) * 0.18, S(p.r), S(p.r)]));
  }

  for (const [top, foot] of [[38, 36], [62, 64]]) {
    rig.stage.add(new Mesh(tube([P(top, 80, 0), P((top + foot) / 2, 88, 0.04), P(foot, 94, 0.06)], S(3.2), S(3)), sponge));
    rig.stage.add(blob(sponge, P(foot, 94.5, 0.1), [S(4.4), S(2.6), S(5)]));
  }

  face(rig, rig.stage, paint, front, {
    eyes: { cx: 50, cy: 44, spread: 13, r: 6 },
    mouth: { cx: 50, cy: 62, w: 24 },
    blush: { cx: 50, cy: 58, spread: 22, r: 6.5 },
  });

  for (const b of BUBBLES) rig.root.add(float(rig, blob(bubble, P(b.cx, b.cy, -0.1), [S(b.r), S(b.r), S(b.r)])));

  return rig;
}
