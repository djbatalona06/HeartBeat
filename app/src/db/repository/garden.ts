import { db } from '../database';
import type { CoupleId, MemberId } from '../../domain/types';
import { floraById, plantIn, plotById, plotsAt, type Garden } from '../../domain/rpg/plots';
import { canAfford } from '../../domain/rpg/shop';
import { spend } from '../../domain/rpg/avatar';
import { levelForXp } from '../../domain/xp';
import { id, now } from './shared';
import { getOrCreateAvatar } from './rpg';
import type { PurchaseResult } from './inventory';

/* -- the garden's ground -----------------------------------------------------
 * Buying something to plant, and putting it in the ground.
 *
 * Follows `cosmetics.ts` exactly — the same duplicate refusal, the same
 * `canAfford` then `spend`, the same inventory row — because the failure it
 * guards against is the same one: coins spent with nothing gained, or a row
 * written that was never paid for.
 *
 * What is different is the ground. Furniture slots are fixed and always there;
 * **plots are earned**, and the level that earns them is derived from the
 * couple's pet XP rather than stored. So the level is read inside the
 * transaction, from the pet row, and never taken as an argument — a level that
 * arrives as a prop is a level that can be stale across a level-up, and the
 * symptom would be somebody planting in ground they had not reached.
 */

/** Everything a member owns out of the flora catalogue. */
export async function ownedFlora(memberId: MemberId): Promise<string[]> {
  const rows = await db.inventory.where('memberId').equals(memberId).toArray();
  return rows.filter((row) => floraById(row.itemId)).map((row) => row.itemId);
}

/**
 * Buy something to plant.
 *
 * A duplicate is refused rather than refined, the same as a dye or a cushion:
 * there is no second level of owning a rose bush, and charging twice for one
 * would be taking coins for nothing.
 */
export async function buyFlora(
  memberId: MemberId,
  coupleId: CoupleId,
  floraId: string,
): Promise<PurchaseResult> {
  const flora = floraById(floraId);
  if (!flora) return { ok: false, reason: 'Nobody sells that.' };

  return db.transaction('rw', db.avatars, db.inventory, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const owned = await db.inventory.where('[memberId+itemId]').equals([memberId, floraId]).first();
    if (owned) return { ok: false, reason: 'Already yours — go and plant it.' };

    const affordCheck = canAfford(avatar.coins, flora.price);
    if (!affordCheck.ok) return { ok: false, reason: affordCheck.reason };

    const paid = spend(avatar, { coins: flora.price }, now());
    if (!paid) return { ok: false, reason: 'Not enough coins.' };
    await db.avatars.put(paid);

    await db.inventory.put({
      id: id(),
      coupleId,
      memberId,
      itemId: floraId,
      refine: 0,
      acquiredAt: now(),
      updatedAt: now(),
    });
    return { ok: true };
  });
}

/**
 * Plant something, or clear a plot by passing `undefined`.
 *
 * Writes to the couple's `pet` row, so it lands for both of you — the same
 * arrangement `placeFurniture` has, and for the same reason: you spend your own
 * coins on a garden you both stand in.
 *
 * The write goes through `plantIn`, which normalises. So a plant retired from
 * the catalogue, or one sitting in ground the couple's level no longer reaches,
 * is dropped on the next planting rather than carried forward forever.
 */
export async function plantFlora(
  memberId: MemberId,
  coupleId: CoupleId,
  plotId: string,
  floraId: string | undefined,
): Promise<PurchaseResult> {
  return db.transaction('rw', db.pet, db.inventory, async () => {
    const plot = plotById(plotId);
    if (!plot) return { ok: false, reason: 'There is no such ground.' };

    const pet = await db.pet.get(coupleId);
    // Derived here rather than taken as an argument: a level that arrives as a
    // prop is a level that can be stale across a level-up.
    const level = levelForXp(pet?.xp ?? 0);

    if (!plotsAt(level).some((reached) => reached.id === plotId)) {
      return { ok: false, reason: `${plot.name} opens at a higher level.` };
    }

    if (floraId) {
      const flora = floraById(floraId);
      if (!flora) return { ok: false, reason: 'Nobody sells that.' };
      const owned = await db.inventory
        .where('[memberId+itemId]').equals([memberId, floraId]).first();
      if (!owned) return { ok: false, reason: 'That one is not yours yet.' };
    }

    const plots = plantIn(pet?.plots as Garden | undefined, level, plotId, floraId);

    // Upserted with the same defaults `awardPetXp` uses, because the pet row is
    // created lazily by whichever of the two happens first — and a couple can
    // reach level 2 and want to plant something before either has opened Party.
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
      plots,
    });
    return { ok: true };
  });
}
