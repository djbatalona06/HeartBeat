import { db } from '../database';
import type { CoupleId, MemberId } from '../../domain/types';
import type { InventoryItem } from '../../domain/rpg/inventory';
import { gearById } from '../../domain/rpg/gear';
import { GEAR_PRICE, REFINE_MAX, canAfford, canRefine, refinePrice } from '../../domain/rpg/shop';
import { spend } from '../../domain/rpg/avatar';
import { id, now } from './shared';
import { getOrCreateAvatar } from './rpg';

/* -- gear ownership ----------------------------------------------------------
 * `Avatar.gear` only ever recorded what is worn. This is the table that
 * answers the question it never could: what does a member actually *have*.
 */

export async function ownedGear(memberId: MemberId): Promise<InventoryItem[]> {
  return db.inventory.where('memberId').equals(memberId).toArray();
}

export interface PurchaseResult {
  ok: boolean;
  reason?: string;
  /** The refine level reached, set only when this purchase raised an item
   *  already owned rather than adding a new one. */
  refined?: number;
}

/**
 * Buy gear. Coins only, no daily cap — the economy is the limit. A first
 * purchase adds the item to the inventory at refine 0; a duplicate purchase
 * of something already owned refines it instead, one level per purchase, up
 * to `REFINE_MAX`.
 *
 * One transaction so a purchase is never split — coins spent with nothing
 * gained, or a row written that was never paid for.
 */
export async function buyGear(
  memberId: MemberId,
  coupleId: CoupleId,
  itemId: string,
): Promise<PurchaseResult> {
  const item = gearById(itemId);
  if (!item) return { ok: false, reason: 'No such item.' };

  return db.transaction('rw', db.avatars, db.inventory, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const owned = await db.inventory.where('[memberId+itemId]').equals([memberId, itemId]).first();

    if (owned) {
      const refineCheck = canRefine(owned.refine);
      if (!refineCheck.ok) return { ok: false, reason: refineCheck.reason };
    }

    const price = owned ? refinePrice(item.rarity, owned.refine) : GEAR_PRICE[item.rarity];
    const affordCheck = canAfford(avatar.coins, price);
    if (!affordCheck.ok) return { ok: false, reason: affordCheck.reason };

    const paid = spend(avatar, { coins: price }, now());
    if (!paid) return { ok: false, reason: 'Not enough coins.' };
    await db.avatars.put(paid);

    if (owned) {
      const refine = Math.min(REFINE_MAX, owned.refine + 1);
      await db.inventory.put({ ...owned, refine, updatedAt: now() });
      return { ok: true, refined: refine };
    }

    await db.inventory.put({
      id: id(),
      coupleId,
      memberId,
      itemId,
      refine: 0,
      acquiredAt: now(),
      updatedAt: now(),
    });
    return { ok: true };
  });
}

/**
 * A welcome gift rather than a purchase — the item revealed at the end of
 * onboarding, and the wallet it is revealed alongside. No coins are *spent*,
 * and it is idempotent: running it again for someone who already has the item
 * (onboarding interrupted and resumed, the effect firing twice) does nothing
 * rather than granting a second one for free.
 *
 * The coins arrive by a different route than the item, and the difference is
 * the point. There is no "grant coins" step here to double-fire, because the
 * starting balance is a property of the avatar row itself — `newAvatar` in
 * `domain/rpg/types.ts` mints it with `STARTER_COINS`. All this does is make
 * sure that row exists before onboarding ends, so a member who never completes
 * a task still has a wallet to open the shop with.
 *
 * That also means it cannot top somebody up. Calling it on a member who has
 * been playing for a month reads their existing avatar and leaves the balance
 * exactly where they earned it, which is the correct behaviour and the reason
 * this is not written as `coins += STARTER_COINS`.
 *
 * One transaction over both tables, so a gift is never half-given.
 */
export async function grantStarterItem(
  memberId: MemberId,
  coupleId: CoupleId,
  itemId: string,
): Promise<void> {
  await db.transaction('rw', db.avatars, db.inventory, async () => {
    // Mints the row at STARTER_COINS if this member has never had one, and is
    // a plain read if they have.
    await getOrCreateAvatar(memberId, coupleId);

    const existing = await db.inventory
      .where('[memberId+itemId]')
      .equals([memberId, itemId])
      .first();
    if (existing) return;
    await db.inventory.put({
      id: id(),
      coupleId,
      memberId,
      itemId,
      refine: 0,
      acquiredAt: now(),
      updatedAt: now(),
    });
  });
}
