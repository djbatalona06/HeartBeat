/**
 * The one drawing each companion owns: its signature skill's landing.
 *
 * The five motions in `vfx.ts` are shared on purpose — they say what kind of
 * thing happened. This is the opposite: a piece nobody else plays, so the
 * moment a companion's best skill lands reads as *that* companion even with
 * the colour taken away. Pure data, drawn from Phaser primitives by
 * `BattleGardenScene`, so the whole set costs no texture and no request.
 *
 * Keyed by the signature's `vfx` key, and `vfx.test.ts` holds the join: every
 * kit's signature has a piece, and nothing else does.
 */

export type SignaturePiece =
  /** Wishbell: a wish, as a star, arriving where the bolt did. */
  | { kind: 'star'; at: 'foe'; points: number }
  /** Cirrus: a gust turning on itself. */
  | { kind: 'spiral'; at: 'self'; arcs: number }
  /** Marigold: a porous shell, one open cell at a time. */
  | { kind: 'cells'; at: 'self'; sides: number }
  /** Mochi: a night-watch moon with a few stars kept awake beside it. */
  | { kind: 'crescent'; at: 'self'; stars: number }
  /** Foxglove: a fan of small flames, one for each life. */
  | { kind: 'fan'; at: 'self'; flames: number };

export const SIGNATURES: Readonly<Record<string, SignaturePiece>> = {
  'horn-bolt': { kind: 'star', at: 'foe', points: 5 },
  'ring-of-wind': { kind: 'spiral', at: 'self', arcs: 3 },
  'braced-stance': { kind: 'cells', at: 'self', sides: 6 },
  'lantern-vigil': { kind: 'crescent', at: 'self', stars: 3 },
  'ink-flare': { kind: 'fan', at: 'self', flames: 9 },
};

export function signatureFor(vfx: string): SignaturePiece | undefined {
  return SIGNATURES[vfx];
}
