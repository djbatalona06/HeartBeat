import type { RaidStatKey, RaidStats } from './raidStats';
import { RAID_STATS, raidSheet } from './raidStats';
import { companionRankLift, companionSource } from './loadout';
import {
  MAX_PET_RANK, PET_RANK_BONDS, petKindById, rankOf,
  type PetInstance, type PetKind, type PetSpecies,
} from './pets';
import { compareTiers, passiveFor, type Tier } from './tiers';

/**
 * What every companion you own is worth, and a way to filter and sort them.
 *
 * ## Why this exists
 *
 * The companion list showed a name, a tier and a rank. Nothing on it said what
 * a companion actually *does* for the fight, so choosing which one to walk with
 * was guesswork — and with twenty kinds across five tiers, a bag of a dozen
 * stops being something you can scan.
 *
 * The numbers are not new. `companionSource` (loadout.ts) already turns a pet
 * into a `StatSource` for the raid sheet; this reads that same source for every
 * pet instead of only the one at your side, so the list and the fight can never
 * disagree about what a companion is worth.
 *
 * ## What "stats" means here
 *
 * Each row's `stats` is that companion **on its own** — the seven raid stats it
 * would add if it were the only thing you owned. That is deliberately not "what
 * your sheet would be with this one walking": the sheet depends on gear, and a
 * list that re-added your gear on every row would make the rows depend on
 * something that is not the companion.
 *
 * Pure: no React, no Dexie, no clock. `companionStats.test.ts` holds it.
 */

export type SkillKind = 'damage' | 'shield' | 'heal' | 'energy';
export const SKILL_KINDS: readonly SkillKind[] = ['damage', 'shield', 'heal', 'energy'];

export interface CompanionRow {
  pet: PetInstance;
  kind: PetKind;
  species: PetSpecies;
  tier: Tier;
  rank: number;
  bond: number;
  /** Bond still needed for the next rank, or null at the ceiling. */
  toNextRank: number | null;
  /** How far through the current rank, 0..1 (1 at the ceiling). */
  rankProgress: number;
  maxed: boolean;
  /** True for the one companion currently walking with the member. */
  active: boolean;
  /** The source's stat level after the half-weight and the rank lift. */
  statLevel: number;
  /** What bond rank adds, as a fraction (0 at rank 1). */
  lift: number;
  /** This companion alone, across the seven stats. */
  stats: RaidStats;
  /** The stat it is named for — the first of its species' four. */
  primary: RaidStatKey;
  /** Its always-on buff, which lands on `primary` and nowhere else. 0 for common. */
  passivePercent: number;
  /** Sum of `stats`, for sorting. Not a power rating. */
  total: number;
  skill: {
    name: string;
    mpCost: number;
    minRank: number;
    /** Whether this companion's rank has reached the skill. */
    unlocked: boolean;
    kinds: SkillKind[];
  };
}

/**
 * Every companion that still exists in the catalogue, as a row.
 *
 * A row whose kind is no longer known is skipped rather than thrown on:
 * `petSheet` throws on it, and a list screen should not be taken down by one
 * stored row it cannot name.
 */
export function companionRows(
  pets: readonly PetInstance[],
  companionId: string | undefined,
): CompanionRow[] {
  const rows: CompanionRow[] = [];
  for (const pet of pets) {
    const kind = petKindById(pet.kindId);
    const source = companionSource(pet);
    if (!kind || !source) continue;

    const rank = rankOf(pet.bond);
    const maxed = rank >= MAX_PET_RANK;
    const floor = PET_RANK_BONDS[rank - 1];
    const ceiling = maxed ? floor : PET_RANK_BONDS[rank];
    const sheet = raidSheet([source]);
    const primary = source.order[0];

    rows.push({
      pet,
      kind,
      species: kind.species,
      tier: kind.rarity,
      rank,
      bond: pet.bond,
      toNextRank: maxed ? null : Math.max(0, ceiling - pet.bond),
      rankProgress: maxed ? 1 : Math.min(1, (pet.bond - floor) / Math.max(1, ceiling - floor)),
      maxed,
      active: pet.id === companionId,
      statLevel: source.statLevel,
      lift: companionRankLift(rank),
      stats: sheet.total,
      primary,
      passivePercent: passiveFor(source.tier, source.statLevel),
      total: RAID_STATS.reduce((sum, key) => sum + sheet.total[key], 0),
      skill: {
        name: kind.skill.name,
        mpCost: kind.skill.mpCost,
        minRank: kind.skill.minRank,
        unlocked: rank >= kind.skill.minRank,
        kinds: SKILL_KINDS.filter((k) => (kind.skill.effect[k] ?? 0) > 0),
      },
    });
  }
  return rows;
}

/* -- filtering and sorting --------------------------------------------------- */

export type CompanionSort =
  | 'rank' | 'tier' | 'bond' | 'total' | 'newest' | 'name' | RaidStatKey;

export interface CompanionFilter {
  /** Any of these tiers. Empty or absent means every tier. */
  tiers?: readonly Tier[];
  species?: PetSpecies;
  /** Gives some of this stat. Sorting by it is a separate choice. */
  stat?: RaidStatKey;
  /** Its skill does this. */
  skill?: SkillKind;
  walkingOnly?: boolean;
  maxedOnly?: boolean;
  sort?: CompanionSort;
}

/** The order the list has always had: rank, then bond, then oldest, then id. */
function byDefault(a: CompanionRow, b: CompanionRow): number {
  return (
    b.rank - a.rank ||
    b.bond - a.bond ||
    a.pet.hatchedAt - b.pet.hatchedAt ||
    a.pet.id.localeCompare(b.pet.id)
  );
}

/**
 * Every sort ends in the same tie-break, so two companions that tie on the
 * chosen field always land in the same order on both phones — the same reason
 * `ownedPets` ends on the id.
 */
function comparator(sort: CompanionSort): (a: CompanionRow, b: CompanionRow) => number {
  switch (sort) {
    case 'rank': return byDefault;
    // Explicit, because a stat level is rolled inside its tier's band: sorting
    // by `total` is not the same thing as sorting by tier, and a mythic can
    // total less than a lucky legendary.
    case 'tier': return (a, b) => compareTiers(b.tier, a.tier) || byDefault(a, b);
    case 'bond': return (a, b) => b.bond - a.bond || byDefault(a, b);
    case 'total': return (a, b) => b.total - a.total || byDefault(a, b);
    case 'newest': return (a, b) => b.pet.hatchedAt - a.pet.hatchedAt || a.pet.id.localeCompare(b.pet.id);
    case 'name': return (a, b) => a.kind.name.localeCompare(b.kind.name) || a.pet.id.localeCompare(b.pet.id);
    default: {
      const stat = sort;
      return (a, b) => b.stats[stat] - a.stats[stat] || byDefault(a, b);
    }
  }
}

/** How many of the filters (not the sort) are narrowing the list right now. */
export function activeFilterCount(filter: CompanionFilter): number {
  return (
    ((filter.tiers?.length ?? 0) > 0 ? 1 : 0) +
    (filter.species !== undefined ? 1 : 0) +
    (filter.stat !== undefined ? 1 : 0) +
    (filter.skill !== undefined ? 1 : 0) +
    (filter.walkingOnly ? 1 : 0) +
    (filter.maxedOnly ? 1 : 0)
  );
}

export function filterCompanions(
  rows: readonly CompanionRow[],
  filter: CompanionFilter,
): CompanionRow[] {
  const tiers = filter.tiers ?? [];
  const kept = rows.filter((row) =>
    (tiers.length === 0 || tiers.includes(row.tier)) &&
    (filter.species === undefined || row.species === filter.species) &&
    (filter.stat === undefined || row.stats[filter.stat] > 0) &&
    (filter.skill === undefined || row.skill.kinds.includes(filter.skill)) &&
    (!filter.walkingOnly || row.active) &&
    (!filter.maxedOnly || row.maxed));
  return kept.sort(comparator(filter.sort ?? 'rank'));
}

/**
 * What there is to filter by, given what is owned — so the bar only offers
 * chips that can match something. Offering "Mythic" to somebody with no mythic
 * companion is a dead button.
 */
export interface CompanionFacets {
  tiers: Tier[];
  species: PetSpecies[];
  stats: RaidStatKey[];
  skills: SkillKind[];
}

export function companionFacets(rows: readonly CompanionRow[]): CompanionFacets {
  const tiers = new Set<Tier>();
  const species = new Set<PetSpecies>();
  const stats = new Set<RaidStatKey>();
  const skills = new Set<SkillKind>();
  for (const row of rows) {
    tiers.add(row.tier);
    species.add(row.species);
    for (const key of RAID_STATS) if (row.stats[key] > 0) stats.add(key);
    for (const kind of row.skill.kinds) skills.add(kind);
  }
  return {
    tiers: [...tiers].sort((a, b) => compareTiers(b, a)),
    species: [...species].sort(),
    stats: RAID_STATS.filter((key) => stats.has(key)),
    skills: SKILL_KINDS.filter((kind) => skills.has(kind)),
  };
}
