import { GEAR_SLOTS, type Stats } from './types';
import {
  SLOT_STATS,
  canEquip,
  gearById,
  normalizeGear,
  type GearItem,
  type Rarity,
  type StoredGear,
} from './gear';
import { addStats, ZERO_STATS } from './avatar';

/** The best-ranked stat in each slot's own order — see `SLOT_STATS` in
 *  gear.ts. Refinement always lands on this one, so it deepens the choice a
 *  slot already represents rather than starting a second one. */
const SLOT_PRIMARY_STAT = Object.fromEntries(
  GEAR_SLOTS.map((slot) => [slot, SLOT_STATS[slot][0]]),
) as Record<(typeof GEAR_SLOTS)[number], keyof Stats>;

/**
 * What coins buy: gear, eggs, and refining a duplicate into a better version of
 * itself rather than a second copy sitting unworn.
 *
 * The economy is the only limit. There is deliberately no daily cap on a
 * purchase or a hatch — coins are earned by doing tasks, and a coin-rich week
 * spending itself down is the reward working as intended, not something to be
 * guarded against.
 */

/** Rarer costs more, on the same ladder the drop odds already use. */
export const GEAR_PRICE: Record<Rarity, number> = {
  common: 30,
  rare: 90,
  epic: 220,
  godly: 500,
};

export const EGG_PRICE = 120;

/**
 * Hatching a kind you already have does not queue a second, unplayable copy —
 * it folds into the one you have, the same way a duplicate item refines
 * rather than sitting unworn. `PET_RANK_BONDS` in `pets.ts` already caps rank
 * at 5, so this needs no ceiling of its own: the existing ladder is the cap.
 * Roughly three quarters of the rank 1→2 threshold (20), so one duplicate is
 * a real step rather than either a rounding error or most of a rank at once.
 */
export const DUPLICATE_PET_BOND = 15;

/**
 * A duplicate does not sit idle. Buying gear you already own — or hatching a
 * companion kind you already have — refines the one you have instead of
 * filling a slot nobody can wear two of at once.
 *
 * Capped at +5, and the same flat gain at every rarity. A godly item earns its
 * size from the rarity budget in `gear.ts`; refinement is a separate, smaller
 * ladder on top; so a refined common never catches a fresh epic, and the cap
 * keeps the ceiling a place a couple can actually reach and feel finished with.
 */
export const REFINE_MAX = 5;
export const REFINE_GAIN = 1;

/** Price to push an owned item from `level` to `level + 1`. Rises each level,
 *  so the fifth point of refinement is a real purchase, not a rounding error. */
export function refinePrice(rarity: Rarity, level: number): number {
  return GEAR_PRICE[rarity] * (level + 1);
}

/** A predicate that says why, the same shape `checkGrant` uses in lifeEvents.ts
 *  — a button that cannot be pressed should say why rather than going dead. */
export type Verdict = { ok: true } | { ok: false; reason: string };

export function canAfford(coins: number, price: number): Verdict {
  if (coins >= price) return { ok: true };
  return { ok: false, reason: `${price - coins} more coins to go.` };
}

export function canRefine(level: number): Verdict {
  if (level < REFINE_MAX) return { ok: true };
  return { ok: false, reason: `Already refined all the way, at +${REFINE_MAX}.` };
}

/** What refinement adds, on top of an item's own rarity bonus. */
export function refinedBonus(item: GearItem, level: number): Partial<Stats> {
  if (level <= 0) return {};
  const capped = Math.min(REFINE_MAX, level);
  return { [SLOT_PRIMARY_STAT[item.slot]]: REFINE_GAIN * capped } as Partial<Stats>;
}

/**
 * What the worn set is worth including refinement — `gearBonus` in gear.ts
 * plus each equipped item's own refine level. Kept here rather than in
 * gear.ts so that module never has to know ownership or refinement exist;
 * this is the one place the two ideas meet.
 */
export function gearBonusWithRefinement(
  equipped: StoredGear,
  level: number,
  refineByItemId: Readonly<Record<string, number>>,
): Stats {
  const worn = normalizeGear(equipped);
  let total: Stats = { ...ZERO_STATS };
  for (const slot of GEAR_SLOTS) {
    const itemId = worn[slot];
    const item = itemId ? gearById(itemId) : undefined;
    if (!item || item.slot !== slot || !canEquip(item, level)) continue;
    total = addStats(total, item.bonus);
    total = addStats(total, refinedBonus(item, refineByItemId[item.id] ?? 0));
  }
  return total;
}
