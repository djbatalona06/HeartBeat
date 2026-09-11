import { db } from '../database';
import type { CoupleId, MemberId } from '../../domain/types';
import { DEFAULT_DYE_ID, dyeById } from '../../domain/rpg/dyes';
import { canAfford } from '../../domain/rpg/shop';
import { spend } from '../../domain/rpg/avatar';
import { id, now } from './shared';
import { getOrCreateAvatar } from './rpg';
import type { PurchaseResult } from './inventory';

/* -- cosmetics ---------------------------------------------------------------
 * Things coins buy that change nothing about what you can do.
 *
 * Deliberately separate from `inventory.ts`, which is gear: gear has a rarity,
 * a stat bonus, a slot, and refinement, and every one of those is a concept a
 * dye does not have. What the two share is the `inventory` table itself — one
 * generic ownership row keyed by a catalogue string, with a `[memberId+itemId]`
 * index for exactly this lookup — so a cosmetic catalogue needs no new table,
 * only an id prefix that keeps it from colliding with gear.
 *
 * The purchase follows `buyGear` exactly, because the failure it guards against
 * is the same one: coins spent with nothing gained, or a row written that was
 * never paid for. One transaction over just the tables touched, ownership read
 * inside it, and a `{ ok, reason? }` back for the screen to show verbatim.
 */

/** Everything a member owns out of one prefixed catalogue. */
export async function ownedCosmetics(memberId: MemberId, prefix: string): Promise<string[]> {
  const rows = await db.inventory.where('memberId').equals(memberId).toArray();
  return rows.filter((row) => row.itemId.startsWith(prefix)).map((row) => row.itemId);
}

/**
 * Buy a colourway.
 *
 * Unlike gear, a duplicate is simply refused rather than refined — there is no
 * second level of owning a colour, and charging twice for one would be taking
 * coins for nothing. The starter dye is never sold: everybody has it, so a
 * shop row offering it at zero would be a button that does nothing.
 */
export async function buyDye(
  memberId: MemberId,
  coupleId: CoupleId,
  dyeId: string,
): Promise<PurchaseResult> {
  const dye = dyeById(dyeId);
  if (!dye) return { ok: false, reason: 'No such colourway.' };
  if (dye.id === DEFAULT_DYE_ID) return { ok: false, reason: 'That one is already yours.' };

  return db.transaction('rw', db.avatars, db.inventory, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const owned = await db.inventory.where('[memberId+itemId]').equals([memberId, dyeId]).first();
    if (owned) return { ok: false, reason: 'Already yours — go and put it on.' };

    const affordCheck = canAfford(avatar.coins, dye.price);
    if (!affordCheck.ok) return { ok: false, reason: affordCheck.reason };

    const paid = spend(avatar, { coins: dye.price }, now());
    if (!paid) return { ok: false, reason: 'Not enough coins.' };
    await db.avatars.put(paid);

    await db.inventory.put({
      id: id(),
      coupleId,
      memberId,
      itemId: dyeId,
      refine: 0,
      acquiredAt: now(),
      updatedAt: now(),
    });
    return { ok: true };
  });
}

/**
 * Put one on. Checks ownership inside the write, so a stale screen listing a
 * colourway that was never bought cannot dress the bird in it.
 *
 * The starter dye is always wearable without owning a row, because it is what
 * the bird hatched in rather than something acquired.
 */
export async function wearDye(
  memberId: MemberId,
  coupleId: CoupleId,
  dyeId: string,
): Promise<PurchaseResult> {
  const dye = dyeById(dyeId);
  if (!dye) return { ok: false, reason: 'No such colourway.' };

  return db.transaction('rw', db.avatars, db.inventory, async () => {
    if (dye.id !== DEFAULT_DYE_ID) {
      const owned = await db.inventory.where('[memberId+itemId]').equals([memberId, dyeId]).first();
      if (!owned) return { ok: false, reason: 'That one is not yours yet.' };
    }
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    await db.avatars.put({ ...avatar, dye: dyeId, updatedAt: now() });
    return { ok: true };
  });
}
