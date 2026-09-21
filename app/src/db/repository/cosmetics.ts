import { db } from '../database';
import type { CoupleId, DayKey, MemberId } from '../../domain/types';
import { DEFAULT_DYE_ID, dyeById } from '../../domain/rpg/dyes';
import { furnitureById, refurnish } from '../../domain/rpg/furniture';
import { canAfford } from '../../domain/rpg/shop';
import { offerFor } from '../../domain/rpg/mysteryShop';
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
 *
 * **Buying is placing.** The room used to be arranged by hand afterwards, and
 * the refusal above still said "put it somewhere". It furnishes itself now, in
 * this same transaction, so a purchase that took the coins can never leave the
 * room unchanged — which is the same guarantee `openChestFor` makes about a
 * chest, for the same reason.
 */
export async function buyFurniture(
  memberId: MemberId,
  coupleId: CoupleId,
  itemId: string,
): Promise<PurchaseResult> {
  const item = furnitureById(itemId);
  if (!item) return { ok: false, reason: 'No such piece.' };

  return db.transaction('rw', db.avatars, db.inventory, db.pet, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const owned = await db.inventory.where('[memberId+itemId]').equals([memberId, itemId]).first();
    if (owned) return { ok: false, reason: 'Already yours.' };

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

    await refurnishHouse(memberId, coupleId);
    return { ok: true };
  });
}

/**
 * Bring the couple's room up to date with one member's furniture.
 *
 * ## Why there is no placing any more
 *
 * There were twelve controls: four slots, each with a Bare option and two
 * pieces, and copy explaining that rearranging it changed what you both saw. A
 * room you furnish by *buying furniture* rewards the thing you actually did,
 * and twelve controls over eight pieces was a configuration screen for a
 * decision nobody was making. `houseFrom` picks the best owned piece per slot;
 * `compareFurniture` says what "best" means and why.
 *
 * ## Upgrades only, and why that is not timidity
 *
 * `Pet.house` is couple-level — it rides the shared pet row — while
 * `inventory` is per-member and is **not** partner-visible, so this phone can
 * only ever see half of what the couple owns. Recomputing the room from one
 * member's inventory and storing the result would delete whatever the other
 * had furnished with, and the two phones would then take turns deleting each
 * other's work on every sync.
 *
 * Taking the better of the two per slot removes that: every write is
 * idempotent, the room only ever improves, and the order the phones sync in
 * stops mattering. See `refurnish`.
 *
 * Called inside `buyFurniture`'s transaction, and safe to call on its own —
 * which is what a device that has just pulled a partner's purchase wants.
 */
export async function refurnishHouse(
  memberId: MemberId,
  coupleId: CoupleId,
): Promise<PurchaseResult> {
  return db.transaction('rw', db.pet, db.inventory, async () => {
    const pet = await db.pet.get(coupleId);
    const owned = await db.inventory.where('memberId').equals(memberId).toArray();
    const house = refurnish(pet?.house, owned.map((row) => row.itemId));

    // Upserted with the same defaults `awardPetXp` uses, because the pet row is
    // created lazily by whichever of the two happens first. On a fresh install
    // that is often this: a couple can furnish the house before either of them
    // has finished a task.
    //
    // No `updatedAt`: `Pet` carries none, because it is reconciled by the XP
    // ledger rather than by last-write-wins like the other tables.
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

/* ---- the daily offer -------------------------------------------------------
 * `domain/rpg/mysteryShop.ts` decides what is on offer and what it costs. This
 * is the one place it can be bought.
 */

/**
 * Buy today's offer at today's price.
 *
 * **The day goes in; the price does not.** The obvious signature takes the
 * offer, or its price, from the screen that rendered it — and a price that
 * arrives as a prop is a price that can be wrong: a stale render across
 * midnight, a component that computed it from a different day key, or simply a
 * future edit that passes the list price by mistake. There is no server here to
 * catch any of that, so the discount is derived again, inside the transaction
 * that spends the coins.
 *
 * Beyond that it is `buyDye` and `buyFurniture` — the same duplicate refusal,
 * the same `canAfford` then `spend`, the same inventory row — so a thing bought
 * on offer is in every later respect a thing bought.
 */
export async function buyOffer(
  memberId: MemberId,
  coupleId: CoupleId,
  day: DayKey,
): Promise<PurchaseResult> {
  const offer = offerFor(day);
  if (!offer) return { ok: false, reason: 'Nothing on the shelf today.' };

  return db.transaction('rw', db.avatars, db.inventory, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const owned = await db.inventory
      .where('[memberId+itemId]').equals([memberId, offer.id]).first();
    if (owned) return { ok: false, reason: 'Already yours — the discount is no use.' };

    const affordCheck = canAfford(avatar.coins, offer.price);
    if (!affordCheck.ok) return { ok: false, reason: affordCheck.reason };

    const paid = spend(avatar, { coins: offer.price }, now());
    if (!paid) return { ok: false, reason: 'Not enough coins.' };
    await db.avatars.put(paid);

    await db.inventory.put({
      id: id(),
      coupleId,
      memberId,
      itemId: offer.id,
      refine: 0,
      acquiredAt: now(),
      updatedAt: now(),
    });
    return { ok: true };
  });
}
