import { GEAR_SLOTS, type GearSlot } from './types';
import { GEAR_PRICE } from './shop';
import { TIERS, passiveFor, stackPassives, statLevelFor, type Tier } from './tiers';
import { hash, roll } from '../hash';
import type { HouseSlot } from './furniture';
import type { PetSpecies } from './pets';

/**
 * The raid sheet: seven numbers, and the rule that nothing in this app is
 * decoration.
 *
 * ## Why a second sheet exists
 *
 * `types.ts` already has four stats — strength, insight, heart, luck — and they
 * are the *avatar's*, the person's own numbers, worn on a body. These seven are
 * the **raid's**: they describe a turn in Eve's Garden, not a character, and
 * two of them (resilience and resonance) belong to the couple rather than to
 * either person. Folding the two sheets together was the first attempt and it
 * produced a `luck` that meant one thing in a shop and another in a fight,
 * which is how a stat stops being arguable.
 *
 * So: the avatar sheet answers "who is this person", the raid sheet answers
 * "what does this turn do". One item feeds both, off the same rung of the same
 * ladder (`tiers.ts`), and the two readings can never disagree about how rare
 * it is because neither of them stores that.
 *
 * ## The rule
 *
 * **Everything carries something.** Gear, furniture, companions, and yes, the
 * dyes. A cosmetic with no number attached is a thing a couple has to justify
 * wanting, and this app is not in the business of making somebody justify
 * wanting a nicer rug. So the rug gives a little Recovery, and the question
 * goes away.
 *
 * What stops that becoming a treadmill is the falloff in `stackPassives`: the
 * fifth source of a buff is worth a fraction of the first, so owning more
 * things stops mattering long before owning *all* the things would.
 */

export type RaidStatKey =
  | 'energy'
  | 'resilience'
  | 'resonance'
  | 'burden'
  | 'fortify'
  | 'reveal'
  | 'recovery';

export const RAID_STATS: readonly RaidStatKey[] = [
  'energy', 'resilience', 'resonance', 'burden', 'fortify', 'reveal', 'recovery',
];

export const RAID_STAT_NAMES: Record<RaidStatKey, string> = {
  energy: 'Energy',
  resilience: 'Resilience',
  resonance: 'Resonance',
  burden: 'Burden',
  fortify: 'Fortify',
  reveal: 'Reveal',
  recovery: 'Recovery',
};

/** One line each, in the words the battle uses rather than in stat-speak. */
export const RAID_STAT_BLURBS: Record<RaidStatKey, string> = {
  energy: 'How many turns you have in you before the day is spent.',
  resilience: 'What the two of you can take. Shared, and only ever shared.',
  resonance: 'How fast the tether charges when you complement each other.',
  burden: 'How hard a logged workout lands on the thing you are fighting.',
  fortify: 'How much of the next hit a shielded turn absorbs.',
  reveal: 'How much of what you are fighting you can actually see.',
  recovery: 'What rest is worth when you finally take some.',
};

export type RaidStats = Record<RaidStatKey, number>;

export const ZERO_RAID_STATS: RaidStats = Object.freeze(
  Object.fromEntries(RAID_STATS.map((key) => [key, 0])) as RaidStats,
);

export function addRaidStats(a: RaidStats, b: Partial<RaidStats>): RaidStats {
  const out = { ...a };
  for (const key of RAID_STATS) out[key] += b[key] ?? 0;
  return out;
}

/* -- dealing a stat level out ------------------------------------------------ */

/**
 * How a source's stat level is split across the stats it leans on, best first.
 *
 * Half to the first, and the rest tapering. The shape matters more than the
 * exact numbers: a source has **one** thing it is for, and three things it also
 * helps with. Four shares rather than seven, so no source touches the whole
 * sheet — a mythic weapon that improved Recovery would make the weapon slot a
 * non-choice, and the slots exist to be a choice.
 */
export const SPREAD_SHARES: readonly number[] = [0.5, 0.25, 0.15, 0.1];

/**
 * `statLevel` points dealt down `order`, summing to exactly `statLevel`.
 *
 * Largest-remainder rather than rounding each share independently, because
 * independent rounding loses or invents a point and then the sheet does not add
 * up to the number printed on the item — which is the sort of small lie that
 * makes somebody stop believing any of the numbers.
 */
export function dealStatLevel(
  statLevel: number,
  order: readonly RaidStatKey[],
): Partial<RaidStats> {
  const points = Math.max(0, Math.round(statLevel));
  if (points === 0 || order.length === 0) return {};

  const width = Math.min(SPREAD_SHARES.length, order.length);
  const shares = SPREAD_SHARES.slice(0, width);
  const weight = shares.reduce((sum, s) => sum + s, 0);

  const exact = shares.map((share) => (points * share) / weight);
  const floors = exact.map(Math.floor);
  let left = points - floors.reduce((sum, n) => sum + n, 0);

  // Biggest fractional part first, ties broken by position so the first stat
  // wins — which is the one the item is named for.
  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byRemainder) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }

  const out: Partial<RaidStats> = {};
  floors.forEach((value, index) => { if (value > 0) out[order[index]] = value; });
  return out;
}

/* -- the orders -------------------------------------------------------------- */

/**
 * Which raid stats each gear slot leans on, best first.
 *
 * Deliberately parallel to `SLOT_STATS` in `gear.ts` and deliberately not
 * derived from it. The avatar orders were written for a different set of four
 * stats, and mapping one onto the other would have produced a helmet that is
 * good at Burden because `insight` happened to rank first.
 */
export const GEAR_RAID_ORDER: Record<GearSlot, readonly RaidStatKey[]> = {
  // A clear head sees what it is fighting.
  helmet: ['reveal', 'resonance', 'energy', 'recovery'],
  // Armour absorbs, and what it cannot absorb the two of you carry.
  chestplate: ['fortify', 'resilience', 'recovery', 'energy'],
  // How far you get before you are spent, and how well you come back.
  boots: ['energy', 'recovery', 'resilience', 'resonance'],
  // A keepsake: the tether, and the clarity of carrying it.
  amulet: ['resonance', 'reveal', 'energy', 'fortify'],
  // The one thing in the fight.
  weapon: ['burden', 'energy', 'fortify', 'reveal'],
};

/**
 * And the house, which is the quieter half of the same idea.
 *
 * Nothing here touches Burden, and that is the point of furniture: a room does
 * not help you hit something. It helps you still be standing, still able to
 * see, and still speaking to each other.
 */
export const FURNITURE_RAID_ORDER: Record<HouseSlot, readonly RaidStatKey[]> = {
  window: ['reveal', 'resonance', 'recovery', 'energy'],
  wall: ['resonance', 'reveal', 'fortify', 'resilience'],
  floor: ['recovery', 'resilience', 'energy', 'fortify'],
  perch: ['resilience', 'recovery', 'resonance', 'fortify'],
};

/** A companion's temperament, as four numbers. */
export const SPECIES_RAID_ORDER: Record<PetSpecies, readonly RaidStatKey[]> = {
  horse: ['resilience', 'burden', 'energy', 'recovery'],
  fairy: ['recovery', 'resonance', 'fortify', 'reveal'],
  vampire: ['burden', 'reveal', 'resonance', 'energy'],
  cat: ['resonance', 'recovery', 'reveal', 'fortify'],
};

/* -- tier from price --------------------------------------------------------- */

/**
 * Where a priced catalogue entry sits on the ladder.
 *
 * Furniture and dyes were written with a price and no tier, years of commits
 * before the ladder existed. Rather than hand-assign sixteen tiers — sixteen
 * chances to quietly make a cushion better than a chestplate — the price *is*
 * the statement of worth, read against the gear ladder that already prices
 * every rung. A rug at 120 coins is rare because 120 coins is what a rare
 * thing costs, and nobody has to remember to keep the two in step.
 */
export function tierForPrice(price: number): Tier {
  let found: Tier = 'common';
  for (const tier of TIERS) if (price >= GEAR_PRICE[tier]) found = tier;
  return found;
}

/* -- sources ----------------------------------------------------------------- */

/**
 * One thing a couple owns, as the raid sees it.
 *
 * `label` is carried so a sheet can say *where* a number came from. A total
 * with no provenance is a number to be argued with and no way to argue.
 */
export interface StatSource {
  id: string;
  label: string;
  tier: Tier;
  statLevel: number;
  order: readonly RaidStatKey[];
}

/** Where in its tier's band a priced or named catalogue entry sits. Stable
 *  across devices and releases, for the reasons `catalogueStatLevel` gives. */
export function sourceStatLevel(id: string, tier: Tier): number {
  return statLevelFor(tier, roll(hash(id), 0));
}

export interface RaidSheet {
  /** Flat points, before any passive. */
  base: RaidStats;
  /** The stacked always-on buff per stat, as a fraction. */
  passives: RaidStats;
  /** What the fight actually uses: base, lifted by its passives, rounded. */
  total: RaidStats;
  /** Every source that contributed, in the order handed in. */
  sources: readonly StatSource[];
}

/**
 * Add it all up.
 *
 * A source's **passive lands on its first stat and nowhere else** — the one it
 * is named for. That mirrors refinement in `shop.ts`, which also deepens the
 * choice a slot already represents rather than starting a second one, and it is
 * what keeps a mythic weapon from being the best amulet in the game as well.
 *
 * Passives are then stacked per stat with the falloff in `tiers.ts`, so seven
 * sources of Fortify are worth roughly three, and the eighth is worth reading
 * about rather than chasing.
 */
export function raidSheet(sources: readonly StatSource[]): RaidSheet {
  let base: RaidStats = { ...ZERO_RAID_STATS };
  const percents: Record<RaidStatKey, number[]> = Object.fromEntries(
    RAID_STATS.map((key) => [key, [] as number[]]),
  ) as Record<RaidStatKey, number[]>;

  for (const source of sources) {
    base = addRaidStats(base, dealStatLevel(source.statLevel, source.order));
    const percent = passiveFor(source.tier, source.statLevel);
    const primary = source.order[0];
    if (percent > 0 && primary) percents[primary].push(percent);
  }

  const passives = { ...ZERO_RAID_STATS };
  const total = { ...ZERO_RAID_STATS };
  for (const key of RAID_STATS) {
    passives[key] = stackPassives(percents[key]);
    total[key] = Math.round(base[key] * (1 + passives[key]));
  }

  return { base, passives, total, sources };
}

/** Every gear slot, so a caller can walk them without importing `types.ts`. */
export const RAID_GEAR_SLOTS: readonly GearSlot[] = GEAR_SLOTS;
