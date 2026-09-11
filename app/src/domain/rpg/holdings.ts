import { GEAR_SLOTS, type GearSlot, type Task } from './types';
import {
  RARITIES, canEquip, gearById, normalizeGear,
  type GearItem, type Rarity, type StoredGear,
} from './gear';
import type { InventoryItem } from './inventory';
import { rankOf, type PetInstance } from './pets';

/**
 * What a member actually has, arranged for one screen to read.
 *
 * The app knew all of this already and had nowhere to say it. Gear ownership
 * lived in `inventory`, worn gear in `Avatar.gear`, companions in `pets`, and
 * a finished to-do went `done: true, archivedAt` and disappeared from the only
 * screen that ever showed it — so the three questions "what do I own", "what
 * am I wearing" and "what have I actually finished" had two half-answers and
 * no answer respectively, spread across two pages.
 *
 * Everything here is pure. It takes rows and returns rows: no Dexie, no React,
 * no clock beyond the `today` a caller passes in. `db/repository/assets.ts`
 * does the reading and this does the arranging, which is what makes the
 * arranging testable — the ordering rules below are the whole design of the
 * screen, and they are exactly the kind of thing that rots silently.
 */

/**
 * Rarity as a sortable number. `RARITIES` is already ordered common → godly,
 * so a rarity's index *is* its rank and the comparators below sort on it
 * descending to put the rarest first.
 */
const RARITY_RANK: Record<Rarity, number> = Object.fromEntries(
  RARITIES.map((rarity, i) => [rarity, i]),
) as Record<Rarity, number>;

export interface OwnedGear {
  row: InventoryItem;
  item: GearItem;
  /** True when this exact item is in the matching slot of `Avatar.gear`. */
  worn: boolean;
  /**
   * Held but not wearable yet, because the item's `minLevel` is above the
   * member's. Worth saying on the card: an item that simply does nothing when
   * tapped is indistinguishable from a broken one.
   */
  locked: boolean;
}

/**
 * Owned gear for one slot, in the order the screen shows it.
 *
 * Worn first, then rarest, then most refined, then alphabetical. Rarity
 * outranks refinement deliberately — a refined common never catches a fresh
 * epic in `shop.ts`'s own numbers, so sorting refinement above rarity would
 * put a weaker item above a stronger one and quietly teach the wrong thing.
 *
 * The refinement step cannot actually fire against today's catalogue: `GEAR`
 * carries exactly one item per rarity per slot, and `inventory` holds one row
 * per member per item, so two entries on the same shelf always differ by
 * rarity and the step above it always decides. It is kept as the guard for a
 * catalogue that grows a second common boot — `holdings.test.ts` pins the
 * one-per-rarity invariant so that day is a test failure rather than a
 * silently arbitrary order.
 *
 * The alphabetical tail is not decoration: without a total order, two items
 * that tie on everything above swap places between renders.
 */
export function ownedInSlot(
  owned: readonly InventoryItem[],
  equipped: StoredGear,
  slot: GearSlot,
  level: number,
): OwnedGear[] {
  const worn = normalizeGear(equipped)[slot];
  const out: OwnedGear[] = [];

  for (const row of owned) {
    const item = gearById(row.itemId);
    // An id with no catalogue entry is skipped rather than thrown over: gear
    // can be retired from `GEAR` between releases, and a phone that has not
    // updated should not white-screen its inventory over one stale row.
    if (!item || item.slot !== slot) continue;
    out.push({
      row,
      item,
      worn: worn === item.id,
      locked: !canEquip(item, level),
    });
  }

  return out.sort(
    (a, b) =>
      Number(b.worn) - Number(a.worn) ||
      RARITY_RANK[b.item.rarity] - RARITY_RANK[a.item.rarity] ||
      b.row.refine - a.row.refine ||
      a.item.name.localeCompare(b.item.name),
  );
}

export interface GearShelf {
  slot: GearSlot;
  owned: OwnedGear[];
}

/** Every slot, in `GEAR_SLOTS` order, including the ones still empty — an
 *  empty shelf is information, and dropping it makes the wardrobe reshuffle
 *  its own layout every time something is bought. */
export function gearShelves(
  owned: readonly InventoryItem[],
  equipped: StoredGear,
  level: number,
): GearShelf[] {
  return GEAR_SLOTS.map((slot) => ({ slot, owned: ownedInSlot(owned, equipped, slot, level) }));
}

export interface OwnedPet {
  pet: PetInstance;
  rank: number;
  /** True for the one companion currently walking with the member. */
  active: boolean;
}

/**
 * Companions, highest rank first, then bond, then oldest.
 *
 * Oldest rather than newest breaks the final tie, so the pet somebody has had
 * since the beginning does not get pushed down the list by one they hatched
 * this morning and have not raised.
 */
export function ownedPets(
  pets: readonly PetInstance[],
  companionId: string | undefined,
): OwnedPet[] {
  return pets
    .map((pet) => ({ pet, rank: rankOf(pet.bond), active: pet.id === companionId }))
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        b.pet.bond - a.pet.bond ||
        a.pet.hatchedAt - b.pet.hatchedAt ||
        a.pet.id.localeCompare(b.pet.id),
    );
}

/**
 * A task that counts as something finished.
 *
 * Two different things are both "completed" and they are not interchangeable.
 * A to-do is done once and archived, so it is finished forever and belongs in
 * a record. A Daily or a Habit is never finished — it has a streak, which is
 * the thing worth showing, and it resets. Flattening the two into one list
 * would make a streak of 40 look like 40 achievements, or make a real
 * achievement disappear the next morning.
 */
export interface FinishedTodo {
  task: Task;
  finishedAt: number;
}

export interface KeptUp {
  task: Task;
  streak: number;
}

/** Finished to-dos, most recently finished first. */
export function finishedTodos(tasks: readonly Task[]): FinishedTodo[] {
  return tasks
    .filter((task) => task.type === 'todo' && task.done === true)
    .map((task) => ({
      task,
      // `archivedAt` is set in the same write that sets `done`, but a row from
      // before that write existed can carry one without the other, so
      // `updatedAt` is the fallback rather than a crash or a 1970 timestamp.
      finishedAt: task.archivedAt ?? task.updatedAt,
    }))
    .sort((a, b) => b.finishedAt - a.finishedAt || a.task.id.localeCompare(b.task.id));
}

/**
 * Dailies and Habits with a streak running, longest first.
 *
 * Archived ones are excluded: a streak on a retired task is a fact about the
 * past that the task itself no longer represents, and showing it beside live
 * ones invites somebody to wonder why it never goes up.
 */
export function keptUp(tasks: readonly Task[]): KeptUp[] {
  return tasks
    .filter((task) => task.type !== 'todo' && !task.archivedAt && task.streak > 0)
    .map((task) => ({ task, streak: task.streak }))
    .sort((a, b) => b.streak - a.streak || a.task.title.localeCompare(b.task.title));
}

export interface HoldingsSummary {
  /** Distinct gear items held, not counting refinement. */
  gearCount: number;
  /** How many of those are on right now. */
  wornCount: number;
  petCount: number;
  finishedCount: number;
  /** The longest streak currently running, or 0. */
  bestStreak: number;
}

export function summarize(
  shelves: readonly GearShelf[],
  pets: readonly OwnedPet[],
  finished: readonly FinishedTodo[],
  streaks: readonly KeptUp[],
): HoldingsSummary {
  const all = shelves.flatMap((shelf) => shelf.owned);
  return {
    gearCount: all.length,
    wornCount: all.filter((entry) => entry.worn).length,
    petCount: pets.length,
    finishedCount: finished.length,
    bestStreak: streaks.reduce((best, entry) => Math.max(best, entry.streak), 0),
  };
}
