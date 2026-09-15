import { GEAR_SLOTS } from './types';
import { canEquip, gearById, normalizeGear, type StoredGear } from './gear';
import { REFINE_MAX, REFINE_GAIN } from './shop';
import { furnitureById, normalizeHouse, type House } from './furniture';
import { dyeById } from './dyes';
import { petKindById, rankOf, type PetInstance } from './pets';
import { milestoneStats } from './milestones';
import { floraById, floraTier, normalizeGarden, plotById, type Garden } from './plots';
import {
  FURNITURE_RAID_ORDER, GEAR_RAID_ORDER, SPECIES_RAID_ORDER, RAID_STATS, raidSheet,
  sourceStatLevel, tierForPrice, type RaidSheet, type RaidStatKey, type StatSource,
} from './raidStats';

/**
 * Everything a couple owns, turned into raid stats.
 *
 * `raidStats.ts` is arithmetic and orders and knows nothing about catalogues;
 * this module is the one place that walks the actual things — the worn gear,
 * the room, the colour of the bird, the companion at your side — and hands
 * them over as sources. The split is the same one `shop.ts` makes against
 * `gear.ts`: the rules module never learns that ownership exists.
 *
 * Nothing here decides what a number is *worth*. Every tier and every stat
 * level comes from `tiers.ts` by way of the catalogue entry's own rung, so
 * there is no second place a value can be tuned and no way for the shop's
 * price and the fight's arithmetic to drift apart.
 */

/** The shared pet's own level, as points. The headline number's contribution. */
export const PET_LEVEL_STAT_STEP = 2;

/** What a companion's rank multiplies its contribution by, per rank above 1.
 *  Five ranks, so a maxed companion is worth 60% more than a fresh one — a
 *  real climb, and short of the gap between two adjacent tiers. */
export const COMPANION_RANK_LIFT = 0.15;

/**
 * The couple's pet, as a source.
 *
 * Deliberately the widest order in the file — the shared pet is the only thing
 * that touches all seven stats, because it is the only thing that *is* the two
 * of you rather than something the two of you bought.
 */
export const PET_RAID_ORDER: readonly RaidStatKey[] = [
  'resilience', 'resonance', 'energy', 'recovery',
];

export interface Loadout {
  /** The shared pet's level, from `domain/xp.ts`. */
  petLevel: number;
  /** The member's own level, which gates what they can wear. */
  memberLevel: number;
  equipped?: StoredGear;
  /** Refine level per gear item id. */
  refineByItemId?: Readonly<Record<string, number>>;
  house?: House;
  dyeId?: string;
  /** The companion taken into the raid. */
  companion?: PetInstance;
  /** What is growing in the garden's plots. */
  garden?: Garden;
}

/**
 * Worn gear, as sources.
 *
 * An item above its level gate contributes nothing rather than throwing, for
 * the same reason `gearBonus` skips it: a level that fell should dim the sheet,
 * not break the page.
 *
 * Refinement adds to the stat level directly rather than getting its own
 * passive. A +5 common should get better at the thing it does; it should not
 * quietly acquire an always-on buff that the tier table says commons do not
 * have.
 */
export function gearSources(
  equipped: StoredGear | undefined,
  memberLevel: number,
  refineByItemId: Readonly<Record<string, number>> = {},
): StatSource[] {
  const worn = normalizeGear(equipped ?? {});
  const out: StatSource[] = [];
  for (const slot of GEAR_SLOTS) {
    const itemId = worn[slot];
    const item = itemId ? gearById(itemId) : undefined;
    if (!item || item.slot !== slot || !canEquip(item, memberLevel)) continue;
    const refine = Math.min(REFINE_MAX, Math.max(0, refineByItemId[item.id] ?? 0));
    out.push({
      id: item.id,
      label: item.name,
      tier: item.rarity,
      statLevel: item.statLevel + refine * REFINE_GAIN,
      order: GEAR_RAID_ORDER[slot],
    });
  }
  return out;
}

/** The room, as sources. Read through `normalizeHouse`, so a rug stored on the
 *  wall contributes nothing rather than contributing as a wall. */
export function furnitureSources(house: House | undefined): StatSource[] {
  const placed = normalizeHouse(house);
  const out: StatSource[] = [];
  for (const [slot, id] of Object.entries(placed)) {
    const piece = furnitureById(id);
    if (!piece) continue;
    const tier = tierForPrice(piece.price);
    out.push({
      id: piece.id,
      label: piece.name,
      tier,
      statLevel: sourceStatLevel(piece.id, tier),
      order: FURNITURE_RAID_ORDER[slot as keyof typeof FURNITURE_RAID_ORDER],
    });
  }
  return out;
}

/**
 * The colourway, as a source.
 *
 * The smallest thing in the file and the one that matters most to the rule: a
 * dye is *purely* a colour, and it still carries a number. The free starter dye
 * is priced at zero and so lands on common, which carries no passive — so the
 * bird you start as is a real, if modest, choice rather than a penalty.
 */
export function dyeSource(dyeId: string | undefined): StatSource | undefined {
  const dye = dyeById(dyeId);
  if (!dye) return undefined;
  const tier = tierForPrice(dye.price);
  return {
    id: dye.id,
    label: dye.name,
    tier,
    statLevel: sourceStatLevel(dye.id, tier),
    // A colour is how you are seen, so it is Reveal first. That is a joke and
    // also the only defensible answer.
    order: ['reveal', 'resonance', 'recovery', 'energy'],
  };
}

/** The companion at your side, lifted by the rank its bond has earned. */
export function companionSource(pet: PetInstance | undefined): StatSource | undefined {
  if (!pet) return undefined;
  const kind = petKindById(pet.kindId);
  if (!kind) return undefined;
  const rank = rankOf(pet.bond);
  const base = sourceStatLevel(kind.id, kind.rarity);
  return {
    id: kind.id,
    label: kind.name,
    tier: kind.rarity,
    statLevel: Math.round(base * (1 + COMPANION_RANK_LIFT * (rank - 1))),
    order: SPECIES_RAID_ORDER[kind.species],
  };
}

/**
 * The shared pet itself, as a source.
 *
 * Two points of stat level per level, which makes it the largest single line on
 * most sheets and by a distance the largest on a mature one — level 50 is 100
 * points against a mythic item's 50. That is the plan stated as arithmetic:
 * gear and furniture feed the pet's effective power, and the pet's own level is
 * the headline number.
 *
 * Its tier is read off the level against the same stat bands everything else
 * uses, so a level-30 pet is *legendary* in exactly the sense a legendary item
 * is, and the two are comparable rather than merely both being large.
 */
export function petSource(petLevel: number, name = 'Your pet'): StatSource {
  const statLevel = Math.max(1, Math.round(petLevel * PET_LEVEL_STAT_STEP));
  return {
    id: 'shared-pet',
    label: name,
    tier: tierForStatLevel(statLevel),
    statLevel,
    order: PET_RAID_ORDER,
  };
}

/**
 * The rung a raw stat level lands on.
 *
 * The inverse of `TIER_STAT_LEVELS`, walked upward so the highest rung whose
 * floor the level clears wins. Lives here rather than in `tiers.ts` because
 * only the pet needs it: everything else knows its own tier and derives its
 * stat level from that, which is the direction the table actually reads.
 */
function tierForStatLevel(statLevel: number) {
  if (statLevel >= 30) return 'mythic' as const;
  if (statLevel >= 20) return 'legendary' as const;
  if (statLevel >= 10) return 'epic' as const;
  if (statLevel >= 4) return 'rare' as const;
  return 'common' as const;
}

/**
 * What is growing in the garden, as sources.
 *
 * Read through `normalizeGarden`, so a plant in a plot this couple has not
 * levelled into contributes nothing — the plot ladder is derived from pet XP
 * and pet XP is reconciled against the server, so a device really can hold a
 * garden briefly ahead of the level it can prove.
 *
 * A plot's *position* decides what the thing planted in it is for. That is the
 * one real idea in this function: pondside is Recovery because it is by the
 * water, not because of what you put there, so moving a bench is a decision
 * rather than a re-skin.
 */
export function floraSources(garden: Garden | undefined, petLevel: number): StatSource[] {
  const planted = normalizeGarden(garden, petLevel);
  const out: StatSource[] = [];
  for (const [plotId, floraId] of Object.entries(planted)) {
    const plot = plotById(plotId);
    const flora = floraById(floraId);
    if (!plot || !flora) continue;
    const tier = floraTier(flora);
    out.push({
      id: flora.id,
      label: `${flora.name}, ${plot.name.toLowerCase()}`,
      tier,
      statLevel: sourceStatLevel(flora.id, tier),
      order: plot.order,
    });
  }
  return out;
}

/**
 * The flat points the level curve itself has handed over.
 *
 * Folded in as a source rather than added to the totals afterwards, so it
 * appears on the raid sheet's provenance list like everything else. Its tier is
 * `common`, which means it carries **no passive** — deliberately: a milestone
 * grant is a floor under a couple who own nothing, and a floor that also
 * multiplied everything above it would make the wardrobe pointless.
 *
 * Its `order` is whatever the milestones actually granted, biggest first, so
 * `dealStatLevel` reproduces the grants rather than re-spreading them into
 * stats no milestone ever mentioned.
 */
export function milestoneSource(petLevel: number): StatSource | undefined {
  const granted = milestoneStats(petLevel);
  const order = RAID_STATS
    .filter((key) => (granted[key] ?? 0) > 0)
    .sort((a, b) => (granted[b] ?? 0) - (granted[a] ?? 0));
  if (order.length === 0) return undefined;

  return {
    id: 'milestones',
    label: 'Levels, earned',
    tier: 'common',
    statLevel: order.reduce((sum, key) => sum + (granted[key] ?? 0), 0),
    order,
  };
}

/** Everything at once. The one call a screen or a fight should need. */
export function loadoutSheet(loadout: Loadout): RaidSheet {
  const sources: StatSource[] = [
    petSource(loadout.petLevel),
    ...gearSources(loadout.equipped, loadout.memberLevel, loadout.refineByItemId),
    ...furnitureSources(loadout.house),
    ...floraSources(loadout.garden, loadout.petLevel),
  ];
  const milestones = milestoneSource(loadout.petLevel);
  if (milestones) sources.push(milestones);
  const dye = dyeSource(loadout.dyeId);
  if (dye) sources.push(dye);
  const companion = companionSource(loadout.companion);
  if (companion) sources.push(companion);
  return raidSheet(sources);
}
