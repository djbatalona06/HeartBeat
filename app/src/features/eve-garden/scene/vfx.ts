import { contrast } from '../../../themes/tokens';

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

/**
 * The three moves a companion draws its own way. Mend is a heal, not a blow,
 * and keeps `MEND_VFX`; Together is the couple's and keeps the plain spark.
 */
export type DrawnMove = 'physical' | 'defensive' | 'magic';

export const DRAWN_MOVES: readonly DrawnMove[] = ['physical', 'defensive', 'magic'];

/** A theme token, never a colour: the pack being worn decides the hue. */
export type EffectToken = 'accent' | 'success' | 'danger' | 'text';

export interface MoveVfx {
  shape: VfxShape;
  token: EffectToken;
  /** How many of the shape — streaks, arcs, motes. */
  count: number;
  /** A multiplier on the beat's length; under calm the beat is zero anyway. */
  pace: number;
}

const v = (shape: VfxShape, token: EffectToken, count: number, pace: number): MoveVfx =>
  ({ shape, token, count, pace });

/**
 * One look per companion per move — fifteen, not five.
 *
 * The motion says what kind of move it was; the token, count and pace say
 * whose. Two rules hold it together and `vfx.test.ts` enforces both: for any
 * one move no two companions share a shape *and* token, and inside a kit the
 * three moves are three different shapes, so a guard never looks like a hit.
 */
export const MOVE_VFX: Record<string, Record<DrawnMove, MoveVfx>> = {
  // Wishbell: one clean shot of the pack's own colour.
  pony: {
    physical: v('bolt', 'accent', 1, 1),
    defensive: v('shield', 'accent', 1, 1),
    magic: v('burst', 'accent', 1, 1),
  },
  // Cirrus: quick, thin, several at once — wind is never one thing.
  avatar: {
    physical: v('bolt', 'text', 3, 0.7),
    defensive: v('shield', 'text', 3, 0.8),
    magic: v('ring', 'text', 2, 0.8),
  },
  // Marigold: slow and round, in twos, and the magic bubbles upward.
  sponge: {
    physical: v('bolt', 'success', 2, 1.2),
    defensive: v('shield', 'success', 2, 1.2),
    magic: v('motes', 'success', 7, 1.2),
  },
  // Mochi: three pads of a pounce, a ribbon held up, one warm lantern ring.
  kitty: {
    physical: v('bolt', 'danger', 3, 0.9),
    defensive: v('shield', 'danger', 1, 1),
    magic: v('ring', 'accent', 1, 1.1),
  },
  // Foxglove: claw marks where it lands, smoke to step through, a fire ring.
  shinobi: {
    physical: v('burst', 'text', 3, 0.8),
    defensive: v('motes', 'text', 9, 0.9),
    magic: v('ring', 'danger', 5, 0.9),
  },
};

/** Mend is the one move every companion draws alike: it rises, and it is green. */
export const MEND_VFX: MoveVfx = v('motes', 'success', 7, 1);

/** The picture for a swing, or nothing — which means the plain spark. */
export function moveVfxFor(kit: string, move: string): MoveVfx | undefined {
  if (move === 'mend') return MEND_VFX;
  return MOVE_VFX[kit]?.[move as DrawnMove];
}

/** WCAG 1.4.11: a graphic that carries meaning needs 3:1 against what it sits on. */
export const EFFECT_CONTRAST = 3;

/** The pack colours a fight draws with, as hex read off the page. */
export type EffectPalette = Record<EffectToken | 'base', string>;

const HEX = /^#?[0-9a-f]{6}$/i;

/**
 * What to paint a token with, and whether it needs an outline.
 *
 * Measured, not assumed: every pack's accent sits under 2.6:1 against its own
 * light ground, and one pack's `danger` does in dark. So a fill that cannot
 * stand on the ground gets an edge in `text`, which clears it everywhere by a
 * wide margin. A colour that is not plain hex cannot be measured, so it gets
 * the edge too — the safe answer to "don't know".
 */
export function effectColours(token: EffectToken, palette: EffectPalette): { fill: string; edge?: string } {
  const fill = palette[token];
  const measurable = HEX.test(fill) && HEX.test(palette.base);
  if (measurable && contrast(fill, palette.base) >= EFFECT_CONTRAST) return { fill };
  return { fill, edge: palette.text };
}
