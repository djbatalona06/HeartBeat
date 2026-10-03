import { db } from '../database';
import type { CoupleId, MemberId } from '../../domain/types';
import { costumeById } from '../../domain/rpg/costumes';
import type { PurchaseResult } from './inventory';
import { getOrCreateAvatar } from './rpg';
import { now } from './shared';

/**
 * Wearing costumes. They are not bought: an egg brings one at its companion's
 * tier (`buyEgg`). The shape is `wearDye`, and the two are deliberately separate
 * sections of the repository — a costume is a drawing over the bird and a dye is
 * the bird's colour, and neither writes the other's field.
 */

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
