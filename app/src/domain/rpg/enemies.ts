/**
 * Three things in the garden, and what it costs to get past them.
 *
 * The register is deliberate. `locations.ts` sends the bird somewhere for "one
 * very good stick" and "a strong opinion about dumplings"; an app whose whole
 * argument is that a bad week should not be punished cannot then fill its first
 * map with horrors. So these are nuisances — a snail with a grievance, a magpie
 * that has taken something, a wasp that will not be reasoned with — and they are
 * beaten rather than killed. The brief's five dark zones can be argued for on
 * their own later; nothing here assumes them.
 *
 * ## Fixed HP, not scaled
 *
 * `tierScale` exists in `boss.ts` because a boss is a recurring fight that has
 * to stay interesting at level 20. A garden snail is a garden snail: walking
 * over it at level 12 is the correct feeling, and the thing that makes the
 * lighthouse worth unlocking. Scaling it would also mean a second caller of the
 * tier maths to keep in step with `worker/src/boss.ts`, for no gain.
 *
 * ## What the numbers are tuned against
 *
 * The zero-vigour, level-1 case — nothing logged, no streak, no gear. At level 1
 * `plainHit` is `round(6 + 1.5 * 1)` = 8, so clearing the three takes 4, 6 and 9
 * hits; with full vigour (+3 strength) it is `round(6 + 6)` = 12, so 3, 4 and 6.
 * Both ends are pinned in the tests.
 *
 * Hits to clear is only half of it, though, and the other half is the honest
 * part: **the snail is the one guaranteed winnable with nothing at your back.**
 * The magpie wants a level or two, and the wasp wants either a few levels or a
 * good week behind you — 46 encounter HP against a swing of 8 does not last the
 * nine rounds the wasp needs. That is deliberate, and it is progression rather
 * than punishment: the three stand at increasing distance from the gate, walking
 * away is free, and being put `'down'` costs nothing but the walk back. What must
 * never happen is the reverse — a fight made *harder* by a quiet week — and that
 * is what `vigour.ts` guarantees and `vigour.test.ts` pins.
 */

export type EnemyAi = 'aggressive' | 'defensive' | 'erratic';

export interface Enemy {
  /** `foe-` prefixed, the way every other catalogue in here is prefixed. */
  id: string;
  name: string;
  /** One line. Read once, when the overlay opens. */
  blurb: string;
  /** Fixed — see the header. */
  maxHp: number;
  /** Flat damage a swing does, before shields, the way `bossDamage` is flat. */
  power: number;
  /**
   * Turn order only, weighed against the party's `luck`. Never touches damage.
   *
   * `luck` is the stat whose own doc comment reserves it for exactly this class
   * of decision — "nudges pet and gear drop rarity, never nudges a payout" — and
   * who swings first is not a payout. That is why there is no fifth stat here: a
   * `speed` key would mean editing `Stats`, `ZERO_STATS`, `addStats`,
   * `baseStats`, `SLOT_STATS`, `RARITY_BUDGET`, `bonusFor` and the whole `GEAR`
   * catalogue to say something the fourth stat already says.
   */
  guile: number;
  /** How it picks its move. Read by the reducer, never by the renderer. */
  ai: EnemyAi;
  /** Pet XP a victory is worth. Small on purpose — see `enemies.test.ts`. */
  xp: number;
  /** Coins for a first win over this one, ever. The `Place.bounty` precedent. */
  bounty: number;
}

export const ENEMY_PREFIX = 'foe-';

/** The ceiling a tuning mistake cannot cross. Pinned by a test. */
export const MAX_ENEMY_XP = 50;

export const ENEMIES: readonly Enemy[] = [
  {
    id: 'foe-snail',
    name: 'Aggrieved snail',
    blurb: 'It was here first and intends to say so at length.',
    maxHp: 32,
    power: 3,
    guile: 0,
    ai: 'defensive',
    xp: 8,
    bounty: 6,
  },
  {
    id: 'foe-magpie',
    name: 'Magpie, holding something',
    blurb: 'Whatever it is, it was yours this morning.',
    maxHp: 48,
    power: 5,
    guile: 2,
    ai: 'erratic',
    xp: 14,
    bounty: 12,
  },
  {
    id: 'foe-wasp',
    name: 'Unreasonable wasp',
    blurb: 'No part of this is a negotiation.',
    maxHp: 72,
    power: 7,
    guile: 5,
    ai: 'aggressive',
    xp: 22,
    bounty: 20,
  },
];

const BY_ID = new Map(ENEMIES.map((e) => [e.id, e]));

/** Total: an unknown id is `undefined`, the way `placeById` and `skillById` are. */
export function enemyById(id: string | undefined): Enemy | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** The ones standing in a zone, in the order the zone lists them. */
export function enemiesIn(enemyIds: readonly string[]): Enemy[] {
  return enemyIds.map((id) => BY_ID.get(id)).filter((e): e is Enemy => e !== undefined);
}
