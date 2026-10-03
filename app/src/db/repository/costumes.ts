import { db } from '../database';
import type { CoupleId, MemberId } from '../../domain/types';
import { spend } from '../../domain/rpg/avatar';
import { canAfford } from '../../domain/rpg/shop';
import { costumeById } from '../../domain/rpg/costumes';
import type { PurchaseResult } from './inventory';
import { getOrCreateAvatar } from './rpg';
import { id, now } from './shared';

/**
 * Buying and wearing costumes. The shape is `buyDye` / `wearDye`, and the two
 * are deliberately separate sections of the repository: a costume is a drawing
 * over the bird and a dye is the bird's colour, and neither writes the other's
 * field.
 */

export async function buyCostume(
  memberId: MemberId,
  coupleId: CoupleId,
  costumeId: string,
): Promise<PurchaseResult> {
  const costume = costumeById(costumeId);
  if (!costume) return { ok: false, reason: 'No such costume.' };

  return db.transaction('rw', db.avatars, db.inventory, async () => {
    const [avatar, owned] = await Promise.all([
      getOrCreateAvatar(memberId, coupleId),
      db.inventory.where('[memberId+itemId]').equals([memberId, costumeId]).first(),
    ]);
    if (owned) return { ok: false, reason: 'Already yours — go and put it on.' };

    const affordCheck = canAfford(avatar.coins, costume.price);
    if (!affordCheck.ok) return { ok: false, reason: affordCheck.reason };

    const paid = spend(avatar, { coins: costume.price }, now());
    if (!paid) return { ok: false, reason: 'Not enough coins.' };
    await db.avatars.put(paid);

    await db.inventory.put({
      id: id(), coupleId, memberId, itemId: costumeId, refine: 0, acquiredAt: now(), updatedAt: now(),
    });
    return { ok: true };
  });
}

/** Put a costume on, or take it off with `null`. Only one you own. */
export async function wearCostume(
  memberId: MemberId,
  coupleId: CoupleId,
  costumeId: string | null,
): Promise<PurchaseResult> {
  if (costumeId !== null && !costumeById(costumeId)) return { ok: false, reason: 'No such costume.' };

  return db.transaction('rw', db.avatars, db.inventory, async () => {
    if (costumeId !== null) {
      const owned = await db.inventory.where('[memberId+itemId]').equals([memberId, costumeId]).first();
      if (!owned) return { ok: false, reason: 'That one is not yours yet.' };
    }
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    await db.avatars.put({ ...avatar, costume: costumeId ?? undefined, updatedAt: now() });
    return { ok: true };
  });
}
