/**
 * What a companion's skill looks like when it lands.
 *
 * `companionSkills.ts` names a `vfx` per skill and says nothing about how to
 * draw it, which is the boundary this directory keeps: the domain decides what
 * a skill *is*, the scene decides what it looks like. This table is the join,
 * and it lives here rather than beside the skills for that reason.
 *
 * Five shapes rather than ten drawings. Ten hand-animated effects would be ten
 * things to maintain and, at sixteen pixels, five of them would be
 * indistinguishable anyway. What actually reads at arm's length is the *motion*
 * — something crossing the gap, something opening around you, something held in
 * front of you — so the shapes are named for the motion and the colour carries
 * whose it is.
 */

export type VfxShape = 'bolt' | 'ring' | 'shield' | 'motes' | 'burst';

const SHAPES: Record<string, VfxShape> = {
  // Wishbell
  'horn-bolt': 'bolt',
  'held-spark': 'motes',
  // Cirrus
  'ring-of-wind': 'ring',
  'rising-current': 'motes',
  // Marigold
  'braced-stance': 'shield',
  // A sponge swelling is a thing opening outwards, not a thing held in front —
  // and a kit whose two skills play the same motion is a kit whose support
  // skill looks like a misfire of its signature.
  swell: 'ring',
  // Mochi
  'lantern-vigil': 'motes',
  'ribbon-coil': 'ring',
  // Foxglove
  'ink-flare': 'burst',
  'ink-split': 'bolt',
};

/** A shape nobody drew still gets one, rather than a turn with nothing on it. */
export const FALLBACK_SHAPE: VfxShape = 'burst';

export function shapeFor(vfx: string | undefined): VfxShape {
  return SHAPES[vfx ?? ''] ?? FALLBACK_SHAPE;
}

/** Every vfx key this table knows, for the test that holds it against the kits. */
export const KNOWN_VFX: readonly string[] = Object.keys(SHAPES);
