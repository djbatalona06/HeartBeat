import { db } from '../database';
import type { CoupleId, MemberId } from '../../domain/types';
import { DEFAULT_DYE_ID, dyeById } from '../../domain/rpg/dyes';
import { clearSlot, furnitureById, placeIn, type HouseSlot } from '../../domain/rpg/furniture';
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
 * Buy a piece of furniture. Same shape as `buyDye`, and a duplicate is refused
 * for the same reason: there is no second level of owning a rug.
 *
 * Bought by a member — coins are per member — into a house that is the
 * couple's. That asymmetry is deliberate and is the point of buying it: you
 * spend your own coins on a room you both see.
 */
export async function buyFurniture(
  memberId: MemberId,
  coupleId: CoupleId,
  itemId: string,
): Promise<PurchaseResult> {
  const item = furnitureById(itemId);
  if (!item) return { ok: false, reason: 'No such piece.' };

  return db.transaction('rw', db.avatars, db.inventory, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const owned = await db.inventory.where('[memberId+itemId]').equals([memberId, itemId]).first();
    if (owned) return { ok: false, reason: 'Already yours — put it somewhere.' };

    const affordCheck = canAfford(avatar.coins, item.price);
    if (!affordCheck.ok) return { ok: false, reason: affordCheck.reason };

    const paid = spend(avatar, { coins: item.price }, now());
    if (!paid) return { ok: false, reason: 'Not enough coins.' };
    await db.avatars.put(paid);

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
 * Place a piece, or clear a slot by passing `undefined` for `itemId`.
 *
 * Writes to the couple's `pet` row, so it lands for both of you. Ownership is
 * checked against the *placing* member: a piece either of you bought can be
 * placed by whoever bought it, which is the only reading that does not require
 * a shared purse the app does not have.
 *
 * The write goes through `placeIn`/`clearSlot`, which normalize — so a retired
 * catalogue id already sitting in the stored house is dropped on the next
 * rearrange rather than being carried forward forever.
 */
export async function placeFurniture(
  memberId: MemberId,
  coupleId: CoupleId,
  slot: HouseSlot,
  itemId: string | undefined,
): Promise<PurchaseResult> {
  return db.transaction('rw', db.pet, db.inventory, async () => {
    const pet = await db.pet.get(coupleId);

    if (itemId) {
      const item = furnitureById(itemId);
      if (!item) return { ok: false, reason: 'No such piece.' };
      if (item.slot !== slot) return { ok: false, reason: `${item.name} does not go there.` };
      const owned = await db.inventory.where('[memberId+itemId]').equals([memberId, itemId]).first();
      if (!owned) return { ok: false, reason: 'That one is not yours yet.' };
    }

    // Upserted with the same defaults `awardPetXp` uses, because the pet row is
    // created lazily by whichever of the two happens first. On a fresh install
    // that is often this: a couple can decorate the house before either of them
    // has finished a task, and refusing there would have been a dead button
    // with a confusing reason on it.
    //
    // No `updatedAt`: `Pet` carries none, because it is reconciled by the XP
    // ledger rather than by last-write-wins like the other tables.
    const house = itemId ? placeIn(pet?.house, itemId) : clearSlot(pet?.house, slot);
    await db.pet.put({
      coupleId,
      level: pet?.level ?? 1,
      xp: pet?.xp ?? 0,
      mood: pet?.mood ?? 'content',
      fedAt: pet?.fedAt ?? now(),
      ...pet,
      house,
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
