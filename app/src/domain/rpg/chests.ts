import { GEAR } from './gear';
import { LUCK_PER_POINT, MAX_LUCK_LIFT, PET_KINDS, applyFloor } from './pets';
import { FURNITURE } from './furniture';
import { DYES } from './dyes';
import { FLORA, floraTier } from './plots';
import { tierForPrice } from './raidStats';
import {
  TIERS, TIER_NAMES, compareTiers, tierRank, tiersAtOrAbove, type Tier,
} from './tiers';

/**
 * Three chests, and the same pity insurance the egg already has.
 *
 * ## Why three rather than one bigger one
 *
 * A single chest with every tier in it is a slot machine: one price, one lever,
 * and the only decision is how many times to pull it. Three is a decision —
 * cheap and often, or dear and rarely — and the decision is legible from the
 * prices without anybody having to read an odds table.
 *
 * ## What pity is for here, which is what it is for everywhere in this app
 *
 * Insurance against a bad run, and nothing else — it **removes the bad tail
 * without moving the median**, which is the only honest version of a pity
 * system and the reasoning `pets.ts` already wrote down at length. The counters
 * are per chest, because a bad run on the cheap chest is not insurance you have
 * paid for on the dear one.
 *
 * The windows were chosen when a chest held one item and reaching one took
 * between one run in four and one in fifteen. A chest holds three now and only
 * counts as a miss when all three missed, so the same windows are reached far
 * more rarely — 1 in 56, 1 in 212 and 1 in 3081. `pityAt` was kept at 6/9/12
 * because those numbers are published. `chests.test.ts` holds the figures, the
 * argument for keeping them, and a tripwire that fails if any of the three
 * inputs moves.
 *
 * Unlike the egg's, these counters are shown. `pityLine` is the sentence, and
 * it is on the chest rather than buried: a floor nobody can see is not a
 * kindness, it is a hidden number.
 */

export type ChestId = 'wooden' | 'silver' | 'gilded';

export const CHEST_IDS: readonly ChestId[] = ['wooden', 'silver', 'gilded'];

/** What can come out of a chest. Every one of these is a real catalogue. */
export type PrizeKind = 'gear' | 'companion' | 'decor' | 'dye' | 'flora';

export const PRIZE_KINDS: readonly PrizeKind[] = ['gear', 'companion', 'decor', 'dye', 'flora'];

export const PRIZE_KIND_NAMES: Record<PrizeKind, string> = {
  gear: 'Gear',
  companion: 'Companion',
  decor: 'Furniture',
  dye: 'Colourway',
  flora: 'Something to plant',
};

export interface Chest {
  id: ChestId;
  name: string;
  blurb: string;
  price: number;
  /** The weight of each tier in this chest's pool. Absent means not in it. */
  weights: Partial<Record<Tier, number>>;
  /**
   * Chests without `pityTier` or better before the next one is guaranteed.
   *
   * Chests, not items. A chest holds `PRIZES_PER_CHEST` of them and counts as
   * a miss only when all of them missed -- see the table in `chests.test.ts`
   * for what that does to how often a floor actually fires.
   */
  pityAt: number;
  pityTier: Tier;
  /** How likely each kind of prize is, before the catalogue has its say. */
  kindWeights: Partial<Record<PrizeKind, number>>;
}

export const CHESTS: readonly Chest[] = [
  {
    id: 'wooden',
    name: 'Wooden Chest',
    blurb: 'Nailed together out of something else. Opens more often than it impresses.',
    price: 90,
    weights: { common: 0.8, rare: 0.2 },
    pityAt: 6,
    pityTier: 'rare',
    kindWeights: { gear: 0.4, decor: 0.2, dye: 0.15, flora: 0.15, companion: 0.1 },
  },
  {
    id: 'silver',
    name: 'Silver Chest',
    blurb: 'Tarnished at the hinges, which is how you know it has been opened before.',
    price: 260,
    weights: { rare: 0.82, epic: 0.18 },
    pityAt: 9,
    pityTier: 'epic',
    kindWeights: { gear: 0.4, companion: 0.22, decor: 0.18, flora: 0.15, dye: 0.05 },
  },
  {
    id: 'gilded',
    name: 'Gilded Chest',
    blurb: 'Gold leaf over the same wood. Everybody knows, and it works anyway.',
    price: 700,
    weights: { epic: 0.8, legendary: 0.17, mythic: 0.03 },
    pityAt: 12,
    pityTier: 'legendary',
    kindWeights: { companion: 0.42, gear: 0.42, flora: 0.11, decor: 0.04, dye: 0.01 },
  },
];

const BY_ID = new Map(CHESTS.map((chest) => [chest.id, chest]));

export function chestById(id: string | undefined): Chest | undefined {
  return id ? BY_ID.get(id as ChestId) : undefined;
}

/** The tiers a chest can actually produce, ascending. */
export function poolOf(chest: Chest): Tier[] {
  return TIERS.filter((tier) => (chest.weights[tier] ?? 0) > 0).sort(compareTiers);
}

/* -- what each catalogue can actually deliver -------------------------------- */

/**
 * Which tiers each prize kind exists at, read off the real catalogues.
 *
 * Built rather than written down, and that is the point: a gilded chest that
 * rolled "mythic cushion" when no mythic cushion exists would have to either
 * throw or quietly hand over something else, and both of those are bugs that
 * only show up on somebody's seven-hundredth coin. Adding a mythic cushion to
 * `furniture.ts` makes the gilded chest able to drop one, with no edit here.
 */
export const KIND_TIERS: Record<PrizeKind, ReadonlySet<Tier>> = {
  gear: new Set(GEAR.map((item) => item.rarity)),
  companion: new Set(PET_KINDS.map((kind) => kind.rarity)),
  decor: new Set(FURNITURE.map((piece) => tierForPrice(piece.price))),
  dye: new Set(DYES.map((dye) => tierForPrice(dye.price))),
  flora: new Set(FLORA.map(floraTier)),
};

/**
 * The kinds this chest can hand over at this tier, with their weights
 * renormalised over what survived.
 *
 * Empty is impossible in practice — gear and companions both run the full
 * ladder — but it is handled rather than assumed, because "impossible in
 * practice" is a sentence about today's catalogue.
 */
export function kindChances(chest: Chest, tier: Tier): Partial<Record<PrizeKind, number>> {
  const out: Partial<Record<PrizeKind, number>> = {};
  let total = 0;
  for (const kind of PRIZE_KINDS) {
    const weight = chest.kindWeights[kind] ?? 0;
    if (weight <= 0 || !KIND_TIERS[kind].has(tier)) continue;
    out[kind] = weight;
    total += weight;
  }
  if (total <= 0) return {};
  for (const kind of PRIZE_KINDS) if (out[kind] !== undefined) out[kind]! /= total;
  return out;
}

/* -- odds -------------------------------------------------------------------- */

/**
 * The odds of the **next** draw from this chest, luck and pity already in it.
 *
 * The same contract `chancesFor` has in `pets.ts`, for the same reason: a
 * screen printing a flat table next to a guarantee it does not mention is
 * telling a small lie every twelfth chest.
 *
 * Luck lifts every tier above the chest's own floor and the floor absorbs the
 * remainder, which is exactly what luck does to an egg — one idea, two callers.
 */
export function chestChances(chest: Chest, luck = 0, pity = 0): Record<Tier, number> {
  const pool = poolOf(chest);
  const out = Object.fromEntries(TIERS.map((tier) => [tier, 0])) as Record<Tier, number>;
  if (pool.length === 0) return out;

  const lift = 1 + Math.min(MAX_LUCK_LIFT, Math.max(0, luck) * LUCK_PER_POINT);
  const bottom = pool[0];

  let rest = 0;
  for (const tier of pool) {
    if (tier === bottom) continue;
    out[tier] = (chest.weights[tier] ?? 0) * lift;
    rest += out[tier];
  }

  // Absurd luck could push the tail past certainty; when it does, the bottom
  // rung simply falls away and the rest keep their proportions.
  if (rest >= 1) {
    for (const tier of pool) if (tier !== bottom) out[tier] /= rest;
    rest = 1;
  }
  out[bottom] = Math.max(0, 1 - rest);

  return chestPityFloor(chest, pity) ? applyFloor(out, chest.pityTier) : out;
}

/** The floor in force on this chest at this count, or null when there is none. */
export function chestPityFloor(chest: Chest, pity: number): Tier | null {
  return pity >= chest.pityAt ? chest.pityTier : null;
}

/** The counter after a draw: cleared at or above the floor tier, else one up. */
export function nextChestPity(chest: Chest, pity: number, got: Tier): number {
  if (tierRank(got) >= tierRank(chest.pityTier)) return 0;
  return Math.max(0, pity) + 1;
}

/**
 * The sentence on the chest.
 *
 * Written three ways on purpose. At zero it must not read as "you have just had
 * one" to somebody who has never opened this chest; at the floor it must say
 * the guarantee is live, because that is the moment the promise is worth
 * something; and in between it is a plain count.
 */
export function pityLine(chest: Chest, pity: number): string {
  const name = TIER_NAMES[chest.pityTier];
  if (chestPityFloor(chest, pity)) return `Guaranteed ${name} or better — this one.`;
  const left = chest.pityAt - Math.max(0, pity);
  if (pity <= 0) return `Guaranteed ${name} or better within ${chest.pityAt} chests.`;
  return `Guaranteed ${name} in ${left} ${left === 1 ? 'chest' : 'chests'}.`;
}

/* -- drawing ----------------------------------------------------------------- */

/**
 * Which tier a draw lands on. `roll` is in [0, 1); the caller owns randomness.
 *
 * Rarest first, so a low roll reaches the tail — the same walk `rollRarity`
 * makes, so the two cannot disagree about which end of the number is lucky.
 */
export function rollChestTier(chest: Chest, roll: number, luck = 0, pity = 0): Tier {
  const chances = chestChances(chest, luck, pity);
  const pool = poolOf(chest);
  let ceiling = 0;
  for (let i = pool.length - 1; i > 0; i -= 1) {
    ceiling += chances[pool[i]];
    if (roll < ceiling) return pool[i];
  }
  return pool[0];
}

/** Which kind of thing, given a second independent roll. */
export function rollPrizeKind(chest: Chest, tier: Tier, roll: number): PrizeKind | null {
  const chances = kindChances(chest, tier);
  let ceiling = 0;
  for (const kind of PRIZE_KINDS) {
    const chance = chances[kind];
    if (chance === undefined) continue;
    ceiling += chance;
    if (roll < ceiling) return kind;
  }
  // Floating point can leave the last sliver unreachable; the heaviest kind
  // that survived is the right answer rather than nothing.
  const kinds = PRIZE_KINDS.filter((k) => chances[k] !== undefined);
  return kinds.length === 0 ? null : kinds.reduce((best, k) =>
    (chances[k] ?? 0) > (chances[best] ?? 0) ? k : best);
}

/** How many items one chest hands over. */
export const PRIZES_PER_CHEST = 3;

/**
 * One item out of a chest: what it is, before ownership has had its say.
 *
 * A *description* of a prize rather than a prize. Turning it into an owned row
 * is the repository's job, because only the repository knows what this couple
 * already has — and a duplicate refines rather than stacking, which is a
 * question about ownership and not about odds.
 */
export interface ChestPrize {
  tier: Tier;
  /** Null only if this chest's catalogues offer nothing at this tier at all. */
  kind: PrizeKind | null;
  /** Where in the tier's stat band this prize should land — see `tiers.ts`. */
  statRoll: number;
  /** Which of the matching catalogue entries, as a number in [0, 1). */
  pickRoll: number;
}

/** One chest, opened. */
export interface ChestOpening {
  chestId: ChestId;
  /**
   * The items, **in the order they were rolled**.
   *
   * Presentation may sort them — `showcaseOrder` is there for that — but this
   * order is what actually came out, and it is the order the repository grants
   * them in, which is what decides which of two items at the same tier got the
   * unowned one.
   */
  prizes: ChestPrize[];
  /** The chest's counter after this opening. It steps at most once. */
  pity: number;
  /** The floor that was in force, which is what `pityLine` promised. */
  floor: Tier | null;
  /** True when that floor actually had to lift an item to keep the promise. */
  lifted: boolean;
}

export interface ChestRolls {
  tier: number;
  kind: number;
  stat: number;
  pick: number;
}

/** Rolls arrive from `Math.random()` and from tests, and neither is trusted. */
function clamped(roll: number): number {
  return Math.min(0.999999, Math.max(0, roll));
}

/** One item at a tier already decided, from its own kind, stat and pick rolls. */
function prizeAt(chest: Chest, tier: Tier, rolls: ChestRolls): ChestPrize {
  return {
    tier,
    kind: rollPrizeKind(chest, tier, rolls.kind),
    statRoll: clamped(rolls.stat),
    pickRoll: clamped(rolls.pick),
  };
}

/**
 * One chest, start to finish, as a pure function of one roll set per item.
 *
 * ## Three items, one guarantee
 *
 * Each item is rolled on the chest's own table with luck folded in and **the
 * floor left out**, and then the floor is applied once, to the chest: if
 * nothing in it reached the pity tier, the best item is lifted to it.
 *
 * Applying the floor to every item instead would turn insurance into a
 * jackpot — a floored gilded chest would hand over three legendaries — and it
 * would make `pityLine` a lie in the generous direction, which is still a lie.
 * "Guaranteed rare or better — this one" is a promise about the chest.
 *
 * ## One step of the counter
 *
 * `pityAt` counts chests, not items, so 6/9/12 mean exactly what they have
 * always meant and every counter already stored and synced stays comparable.
 * The step is taken against the **best** tier in the opening, because a chest
 * that handed over an epic has paid out whatever the other two were.
 */
export function openChest(
  chest: Chest,
  rolls: readonly ChestRolls[],
  luck = 0,
  pity = 0,
): ChestOpening {
  const floor = chestPityFloor(chest, pity);
  const tiers = rolls.map((roll) => rollChestTier(chest, roll.tier, luck, 0));

  let lifted = false;
  if (floor && tiers.length > 0 && !tiers.some((tier) => tierRank(tier) >= tierRank(floor))) {
    let best = 0;
    for (let i = 1; i < tiers.length; i += 1) {
      if (tierRank(tiers[i]) > tierRank(tiers[best])) best = i;
    }
    tiers[best] = floor;
    lifted = true;
  }

  return {
    chestId: chest.id,
    prizes: tiers.map((tier, i) => prizeAt(chest, tier, rolls[i])),
    // An opening with no items in it is not an opening, and must not cost
    // somebody a step of their counter.
    pity: tiers.length === 0
      ? Math.max(0, pity)
      : nextChestPity(chest, pity, tiers.reduce(
        (top, tier) => (tierRank(tier) > tierRank(top) ? tier : top),
      )),
    floor,
    lifted,
  };
}

/**
 * The same items, worst first — **presentation only**.
 *
 * A reveal that builds to the best thing in the chest is the reason this
 * exists. It returns a copy, and `ChestOpening.prizes` keeps the rolled order,
 * because the order things were granted in is a fact about what happened and
 * the order they are shown in is a choice about how to show it.
 */
export function showcaseOrder<T extends { tier: Tier }>(prizes: readonly T[]): T[] {
  return [...prizes].sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
}

/** Every tier a chest can reach that is at or above its own pity floor. The
 *  shape the "what am I insured for" line on a chest card wants. */
export function insuredTiers(chest: Chest): Tier[] {
  const above = new Set(tiersAtOrAbove(chest.pityTier));
  return poolOf(chest).filter((tier) => above.has(tier));
}

/* -- picking the actual thing ------------------------------------------------ */

/**
 * Every catalogue entry a kind offers at a tier, as ids.
 *
 * One function over four catalogues rather than four call sites with a filter
 * each, so "what can a gilded chest hand over" has exactly one answer and the
 * repository never has to know that furniture is priced and gear is not.
 */
export function candidatesFor(kind: PrizeKind, tier: Tier): string[] {
  switch (kind) {
    case 'gear':
      return GEAR.filter((item) => item.rarity === tier).map((item) => item.id);
    case 'companion':
      return PET_KINDS.filter((k) => k.rarity === tier).map((k) => k.id);
    case 'decor':
      return FURNITURE.filter((p) => tierForPrice(p.price) === tier).map((p) => p.id);
    case 'dye':
      return DYES.filter((d) => tierForPrice(d.price) === tier).map((d) => d.id);
    case 'flora':
      return FLORA.filter((f) => floraTier(f) === tier).map((f) => f.id);
    default:
      return [];
  }
}

/**
 * Which one, from a roll in [0, 1).
 *
 * `preferred` is the repository's chance to say "not one of these, they are
 * already owned" without this module learning what ownership is. When
 * everything is already owned the list comes back empty and the ordinary pick
 * stands — a duplicate is a real outcome and the caller compensates for it,
 * rather than this function looping looking for a miracle.
 */
export function pickPrizeId(
  kind: PrizeKind,
  tier: Tier,
  roll: number,
  preferred: readonly string[] = [],
): string | null {
  const all = candidatesFor(kind, tier);
  if (all.length === 0) return null;
  const wanted = new Set(preferred);
  const pool = preferred.length > 0 ? all.filter((id) => wanted.has(id)) : all;
  const from = pool.length > 0 ? pool : all;
  const index = Math.min(from.length - 1, Math.floor(Math.min(0.999999, Math.max(0, roll)) * from.length));
  return from[index];
}
