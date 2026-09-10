import { db } from '../database';
import type { MemberId } from '../../domain/types';
import type { Avatar, Task } from '../../domain/rpg/types';
import type { PetInstance } from '../../domain/rpg/pets';
import type { InventoryItem } from '../../domain/rpg/inventory';

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
}

/**
 * One member's whole holdings, in one pass.
 *
 * Deliberately one function rather than four queries in the component. Dexie's
 * live query observes every table read inside the callback it is given, so
 * wrapping this in a single `useLiveQuery` is still reactive to all four —
 * while four separate live queries would re-render the screen up to four times
 * for one purchase, and the intermediate renders are exactly the ones where
 * the wallet has already been debited and the item has not arrived yet.
 */
export async function holdingsOf(memberId: MemberId): Promise<Holdings> {
  const [avatar, gear, pets, tasks] = await Promise.all([
    db.avatars.get(memberId),
    db.inventory.where('memberId').equals(memberId).toArray(),
    db.pets.where('memberId').equals(memberId).toArray(),
    db.tasks.where('memberId').equals(memberId).toArray(),
  ]);
  return { avatar, gear, pets, tasks };
}
