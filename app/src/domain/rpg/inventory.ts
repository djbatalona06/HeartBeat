import type { CoupleId, MemberId } from '../types';

/**
 * One owned gear item. Companions need no equivalent table — a hatched
 * `PetInstance` already *is* ownership, and a duplicate hatch merges bond into
 * the existing row rather than needing a second one counted. Gear is
 * different: `Avatar.gear` only ever recorded what is *worn*, never what is
 * *held*, so there was nowhere for "you have this but it is not on" to live
 * until now.
 */
export interface InventoryItem {
  id: string;
  coupleId: CoupleId;
  memberId: MemberId;
  /** A `GearItem.id` from the catalogue in `gear.ts`. */
  itemId: string;
  /** 0 until refined at least once. See `REFINE_MAX` in `shop.ts`. */
  refine: number;
  acquiredAt: number;
  updatedAt: number;
}

export function ownsItem(owned: readonly InventoryItem[], itemId: string): boolean {
  return owned.some((row) => row.itemId === itemId);
}

export function findOwned(
  owned: readonly InventoryItem[],
  itemId: string,
): InventoryItem | undefined {
  return owned.find((row) => row.itemId === itemId);
}

/** The lookup `gearBonusWithRefinement` in `shop.ts` wants: item id to level. */
export function refineByItemId(owned: readonly InventoryItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of owned) out[row.itemId] = row.refine;
  return out;
}
