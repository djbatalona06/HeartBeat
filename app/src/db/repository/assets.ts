import { db } from '../database';
import type { MemberId } from '../../domain/types';
import type { Avatar, Task } from '../../domain/rpg/types';
import type { PetInstance } from '../../domain/rpg/pets';
import type { InventoryItem } from '../../domain/rpg/inventory';
import type { Pet } from '../../domain/types';

/* -- what a member holds -----------------------------------------------------
 * The reads behind the asset manager. Four tables that had never been asked
 * the same question at the same time: what is held, who is walking with you,
 * and what has actually been finished.
 *
 * Reads only. Everything the manager can *do* — equip, refine, set a companion
 * — already had a home in `rpg.ts` and `inventory.ts`, and a second way to
 * write the same row is how two code paths end up disagreeing about it.
 */

export interface Holdings {
  /**
   * The wallet and the worn set. Undefined only in the window before
   * `getOrCreateAvatar` has run for a brand-new member, which the screen
   * renders as "opening it up" rather than as an empty bag.
   */
  avatar?: Avatar;
  gear: InventoryItem[];
  pets: PetInstance[];
  /** Every task this member has, live and archived. The split between
   *  "finished" and "kept up" is a domain decision — see `holdings.ts` — and
   *  is deliberately not made here, so the screen can show both from one read
   *  rather than this module guessing which one it wanted. */
  tasks: Task[];
  /**
   * The couple's shared pet, for the two things on it the bag needs: its XP,
   * which is the raid sheet's headline source, and the house, which is up to
   * four of the sheet's sources.
   *
   * Couple-level while everything else here is per-member, which is why it is
   * read through the avatar's `coupleId` rather than from the argument.
   * Undefined until either of them has done anything at all.
   */
  pet?: Pet;
}

/**
 * One member's whole holdings, in one pass.
 *
 * Deliberately one function rather than five queries in the component. Dexie's
 * live query observes every table read inside the callback it is given, so
 * wrapping this in a single `useLiveQuery` is still reactive to all of them —
 * while five separate live queries would re-render the screen up to five times
 * for one purchase, and the intermediate renders are exactly the ones where
 * the wallet has already been debited and the item has not arrived yet.
 *
 * The pet is read *after* the rest rather than alongside, because its key is
 * the avatar's `coupleId` and there is nothing else to learn that from. One
 * extra round trip on a screen that was already doing four in parallel, and it
 * keeps the whole thing inside the one observed callback.
 */
export async function holdingsOf(memberId: MemberId): Promise<Holdings> {
  const [avatar, gear, pets, tasks] = await Promise.all([
    db.avatars.get(memberId),
    db.inventory.where('memberId').equals(memberId).toArray(),
    db.pets.where('memberId').equals(memberId).toArray(),
    db.tasks.where('memberId').equals(memberId).toArray(),
  ]);
  const pet = avatar ? await db.pet.get(avatar.coupleId) : undefined;
  return { avatar, gear, pets, tasks, pet };
}
