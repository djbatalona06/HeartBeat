import { db } from '../database';
import { DEFAULT_SETTINGS, type DayKey, type MemberId } from '../../domain/types';
import { addDays } from '../../domain/day';
import { starterPlanFor } from '../../domain/rpg/starterPlan';
import {
  newAvatar,
  SCHEDULED_TYPES,
  type AreaId,
  type Avatar,
  type GearSlot,
  type LifeEventKind,
  type Payout,
  type Reward,
  type TaskDifficulty,
  type TaskType,
} from '../../domain/rpg/types';
import { complete, newTask, pressDown, settleMissed, toneFor } from '../../domain/rpg/task';
import { applyPayout, levelOf, sheetFor, spend } from '../../domain/rpg/avatar';
import { adventureCost } from '../../domain/rpg/stage';
import { canTravel, findAt, isNewTo, placeById, travelCost } from '../../domain/rpg/locations';
import { GOOD_VIBES_SENDER_GRANT, checkGrant, grantFor } from '../../domain/rpg/lifeEvents';
import { equip, unequip } from '../../domain/rpg/gear';
import { maxPetMp, petKindById, rankOf, rollKind, type PetInstance } from '../../domain/rpg/pets';
import { refineByItemId } from '../../domain/rpg/inventory';
import { DUPLICATE_PET_BOND, EGG_PRICE, canAfford, gearBonusWithRefinement } from '../../domain/rpg/shop';
import { id, now } from './shared';
import { addXp } from './petXp';


/* -- the RPG layer ---------------------------------------------------------- */

/**
 * Everything below composes the pure functions in `domain/rpg/` with exactly
 * one write each. The rule the whole app is built on holds here too: nothing in
 * `features/` touches Dexie, and nothing outside this file decides what a
 * completion is worth.
 *
 * Note what is absent. There is no function here that subtracts from a pool
 * because a day went badly, and no caller could write one without adding a
 * field to `neglect()` first. Health exists only inside a boss fight, and the
 * boss fight's health lives on the server.
 */

export async function avatarFor(memberId: MemberId): Promise<Avatar | undefined> {
  return db.avatars.get(memberId);
}

export async function getOrCreateAvatar(
  memberId: MemberId,
  coupleId: string,
): Promise<Avatar> {
  const existing = await db.avatars.get(memberId);
  if (existing) return existing;
  const fresh = newAvatar(memberId, coupleId, now());
  await db.avatars.put(fresh);
  return fresh;
}

export interface TaskDraft {
  coupleId: string;
  memberId: MemberId;
  type: TaskType;
  title: string;
  difficulty?: TaskDifficulty;
  notes?: string;
  dueDays?: number[];
  /** Goals only. Re-filing one is an edit like any other. */
  area?: AreaId;
  /** Set once, when a goal is adopted from the catalogue. Never edited. */
  suggestionId?: string;
}

/**
 * Create or edit. An edit never touches `value` or `streak`: renaming a task
 * you have kept up for a month must not quietly reset what it is worth.
 */
export async function putTask(draft: TaskDraft, day: DayKey, taskId?: string): Promise<string> {
  const existing = taskId ? await db.tasks.get(taskId) : undefined;
  if (existing) {
    await db.tasks.put({
      ...existing,
      title: draft.title,
      notes: draft.notes,
      difficulty: draft.difficulty ?? existing.difficulty,
      dueDays: draft.dueDays,
      area: draft.area ?? existing.area,
      // Provenance, not a field: where a goal came from cannot be edited into
      // something it did not come from.
      suggestionId: existing.suggestionId,
      updatedAt: now(),
    });
    return existing.id;
  }
  const task = newTask({ id: id(), ...draft }, now(), day);
  await db.tasks.put(task);
  return task.id;
}

/**
 * Plants the starter plan exactly once per install: six fixed dailies and two
 * that rotate with the ISO week, so Tasks is never the empty list and blank
 * text field a brand-new pair would otherwise open to.
 *
 * Guarded inside the transaction it writes in, not by a check beforehand --
 * two calls racing on the same cold start (the identity effect can fire more
 * than once) must not plant sixteen tasks instead of eight.
 */
export async function seedStarterPlan(
  memberId: MemberId,
  coupleId: string,
  day: DayKey,
): Promise<boolean> {
  return db.transaction('rw', db.settings, db.tasks, async () => {
    const settings = await db.settings.get('settings');
    if (settings?.starterPlanSeededAt) return false;

    for (const starter of starterPlanFor(day)) {
      // Seeded filed rather than loose: the starter plan draws from the same
      // catalogue Goals offers, so carrying the area and the id across means
      // the areas screen has something in it on day one and the ideas screen
      // knows not to offer back what was already planted.
      const task = newTask(
        {
          id: id(),
          coupleId,
          memberId,
          type: 'daily',
          title: starter.title,
          difficulty: starter.difficulty,
          area: starter.area,
          suggestionId: starter.id,
        },
        now(),
        day,
      );
      await db.tasks.put(task);
    }

    await db.settings.put({ ...(settings ?? DEFAULT_SETTINGS), id: 'settings', starterPlanSeededAt: now() });
    return true;
  });
}

export async function archiveTask(taskId: string): Promise<void> {
  const task = await db.tasks.get(taskId);
  if (!task) return;
  await db.tasks.put({ ...task, archivedAt: now(), updatedAt: now() });
}

export interface CompletionReceipt {
  payout: Payout;
  levelBefore: number;
  levelAfter: number;
  /** The value tone after the completion, for the line the screen shows. */
  tone: ReturnType<typeof toneFor>;
  /** Set when the companion's own bar moved. */
  companionMp?: number;
}

/**
 * The one place `complete()` and `applyPayout()` meet. Both are pure; this is
 * the seam, and the transaction is what keeps a payout from being credited to a
 * task that failed to save.
 *
 * Returns null when there was nothing to do — a Daily already ticked off today
 * pays nothing the second time, which is the only guard the value curve needs
 * against being farmed.
 */
export async function completeTask(
  taskId: string,
  day: DayKey,
): Promise<CompletionReceipt | null> {
  return db.transaction('rw', db.tasks, db.avatars, db.pet, db.pets, async () => {
    const task = await db.tasks.get(taskId);
    if (!task || task.archivedAt || task.done) return null;
    if (task.type !== 'habit' && task.lastCompletedOn === day) return null;

    const result = complete(task, day);
    await db.tasks.put({
      ...task,
      value: result.value,
      streak: result.streak,
      lastCompletedOn: result.lastCompletedOn,
      lastSettledOn: day,
      done: result.done ? true : task.done,
      archivedAt: result.done ? now() : task.archivedAt,
      updatedAt: now(),
    });

    const before = await getOrCreateAvatar(task.memberId, task.coupleId);
    const after = applyPayout(before, result.payout, now());
    await db.avatars.put(after);

    // XP is both shared and personal now: the couple's pet levels from
    // everything either of you does, and each of you also has a sheet. What was
    // wrong was competing over it, not having it.
    await addXp(task.coupleId, result.payout.xp);

    // Doing your own list charges your companion's bar. That is the reason to
    // have chosen one.
    let companionMp: number | undefined;
    if (after.companionId) {
      const pet = await db.pets.get(after.companionId);
      const kind = pet ? petKindById(pet.kindId) : undefined;
      if (pet && kind) {
        const bond = pet.bond + 1;
        const ceiling = maxPetMp(kind, rankOf(bond));
        companionMp = Math.min(ceiling, pet.mp + result.payout.mp);
        await db.pets.put({ ...pet, bond, mp: companionMp, updatedAt: now() });
      }
    }

    return {
      payout: result.payout,
      levelBefore: levelOf(before),
      levelAfter: levelOf(after),
      tone: toneFor(result.value),
      companionMp,
    };
  });
}

/**
 * The minus side of a Habit. It moves the value and nothing else — the slip is
 * recorded, and recording it is the whole of it.
 */
export async function logHabitDown(taskId: string): Promise<void> {
  const task = await db.tasks.get(taskId);
  if (!task || task.type !== 'habit' || task.archivedAt) return;
  const result = pressDown(task);
  await db.tasks.put({ ...task, ...result, updatedAt: now() });
}

/**
 * Walk every Daily forward to yesterday. Called on boot and on a day rollover;
 * safe to call as often as either happens, because `settleMissed` starts the
 * day after the last one already judged.
 */
export async function settleTasks(memberId: MemberId, today: DayKey): Promise<number> {
  const throughDay = addDays(today, -1);
  // Both scheduled types, because a goal that is missed has to drift for the
  // same reason a daily does — it becomes worth more when you come back to it.
  // Two point lookups on the compound index rather than a scan of every task.
  const tasks = (await Promise.all(
    SCHEDULED_TYPES.map((type) => db.tasks.where('[memberId+type]').equals([memberId, type]).toArray()),
  )).flat();
  let missed = 0;
  for (const task of tasks) {
    const result = settleMissed(task, throughDay);
    if (result.missed === 0 && result.lastSettledOn === task.lastSettledOn) continue;
    missed += result.missed;
    await db.tasks.put({
      ...task,
      value: result.value,
      streak: result.streak,
      lastSettledOn: result.lastSettledOn,
      updatedAt: now(),
    });
  }
  return missed;
}

/* -- life events ------------------------------------------------------------ */

export interface GrantResult {
  ok: boolean;
  reason?: string;
  payout?: Payout;
}

/**
 * Grants energy for something true about the day. `fromMemberId` is what makes
 * it Good Vibes: the one grant you cannot give yourself.
 */
export async function grantLifeEvent(
  coupleId: string,
  memberId: MemberId,
  kind: LifeEventKind,
  day: DayKey,
  options: { fromMemberId?: MemberId; note?: string } = {},
): Promise<GrantResult> {
  return db.transaction('rw', db.lifeEvents, db.avatars, async () => {
    const recent = await db.lifeEvents.where('[coupleId+day]').equals([coupleId, day]).toArray();
    const check = checkGrant(recent, kind, memberId, day, options.fromMemberId);
    if (!check.ok) return { ok: false, reason: check.reason };

    const at = now();
    await db.lifeEvents.put({
      id: id(),
      coupleId,
      memberId,
      kind,
      day,
      fromMemberId: options.fromMemberId,
      note: options.note,
      grantedAt: at,
      updatedAt: at,
    });

    const payout = grantFor(kind);

    // Who gets paid here, and who gets paid somewhere else.
    //
    // A grant with no sender is one this device made about its own day, so the
    // recipient's avatar is the local one and paying it here is right. Good
    // Vibes are the other case: the *sender's* phone writes the row, and the
    // recipient's avatar only exists here as a hollow copy that
    // `collectPending` never pushes and `shouldApply` never accepts. Paying it
    // here spent the energy into a row nobody reads.
    //
    // So the recipient is paid on their own device, by `settleLifeEvents`, once
    // the row reaches them. See db/repository/lifeEventSettle.ts.
    if (!options.fromMemberId) {
      const recipient = await getOrCreateAvatar(memberId, coupleId);
      await db.avatars.put(applyPayout(recipient, payout, at));
    }

    // Sending is worth something too, or nobody sends.
    if (kind === 'good-vibes' && options.fromMemberId) {
      const sender = await getOrCreateAvatar(options.fromMemberId, coupleId);
      await db.avatars.put(applyPayout(sender, GOOD_VIBES_SENDER_GRANT, at));
    }

    return { ok: true, payout };
  });
}

/* -- rewards ---------------------------------------------------------------- */

export async function putReward(
  reward: Omit<Reward, 'id' | 'createdAt' | 'updatedAt'>,
  rewardId?: string,
): Promise<string> {
  const existing = rewardId ? await db.rewards.get(rewardId) : undefined;
  const row: Reward = {
    ...reward,
    id: existing?.id ?? id(),
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  };
  await db.rewards.put(row);
  return row.id;
}

/**
 * Coins out. A redemption is written as its own row rather than mutating the
 * reward, so a thing you buy every week stays one reward with a history.
 */
export async function redeemReward(
  rewardId: string,
  memberId: MemberId,
  day: DayKey,
): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction('rw', db.rewards, db.avatars, db.redemptions, async () => {
    const reward = await db.rewards.get(rewardId);
    if (!reward) return { ok: false, reason: 'No such reward.' };

    const avatar = await getOrCreateAvatar(memberId, reward.coupleId);
    const paid = spend(avatar, { coins: reward.cost }, now());
    if (!paid) {
      return { ok: false, reason: `${reward.cost - avatar.coins} more coins to go.` };
    }

    await db.avatars.put(paid);
    await db.redemptions.put({
      id: id(),
      coupleId: reward.coupleId,
      memberId,
      rewardId: reward.id,
      title: reward.title,
      cost: reward.cost,
      day,
      redeemedAt: now(),
    });
    return { ok: true };
  });
}

/* -- gear and companions ---------------------------------------------------- */

/**
 * Wearing requires owning. A row equipped before ownership existed (nothing
 * in the app predates it by much, but a dev database might) is left worn
 * rather than stripped — this only gates the next *change*, never un-equips
 * something already on.
 */
export async function equipItem(
  memberId: MemberId,
  coupleId: string,
  itemId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const owned = await db.inventory.where('[memberId+itemId]').equals([memberId, itemId]).first();
  if (!owned) return { ok: false, reason: 'Not owned yet — buy it from the shop first.' };

  const avatar = await getOrCreateAvatar(memberId, coupleId);
  const result = equip(avatar.gear, itemId, levelOf(avatar));
  if (!result.ok) return { ok: false, reason: result.reason };
  await db.avatars.put({ ...avatar, gear: result.equipped, updatedAt: now() });
  return { ok: true };
}

export async function unequipSlot(
  memberId: MemberId,
  coupleId: string,
  slot: GearSlot,
): Promise<void> {
  const avatar = await getOrCreateAvatar(memberId, coupleId);
  await db.avatars.put({ ...avatar, gear: unequip(avatar.gear, slot), updatedAt: now() });
}

/**
 * Hatch an egg for free, always inserting a new row even over a kind already
 * held. The rolls are passed in rather than taken here so the caller owns the
 * randomness and this stays testable — and so a drop can be replayed exactly
 * when something looks wrong.
 *
 * Not the production path: the "Hatch an egg" button spends coins and merges
 * a duplicate kind rather than stacking it, both of which live in `buyEgg`
 * below. This stays as the low-level primitive it wraps, and as a plain
 * fixture builder for tests that are about companion mechanics rather than
 * the economy.
 */
export async function hatchPet(
  coupleId: string,
  memberId: MemberId,
  rolls: { rarity: number; species: number },
  luck: number,
  victoryBonus = 0,
): Promise<PetInstance> {
  const kind = rollKind(rolls.rarity, rolls.species, luck, victoryBonus);
  const pet: PetInstance = {
    id: id(),
    coupleId,
    memberId,
    kindId: kind.id,
    bond: 0,
    mp: 0,
    hatchedAt: now(),
    updatedAt: now(),
  };
  await db.pets.put(pet);
  return pet;
}

export interface HatchResult {
  ok: boolean;
  reason?: string;
  pet?: PetInstance;
  /** True when this hatch folded into an existing pet of the same kind
   *  rather than adding a new one. */
  merged?: boolean;
}

/**
 * Hatch an egg, coins first. Rolls are passed in for the same reason
 * `hatchPet` takes them: the caller owns the randomness, so a drop can be
 * replayed exactly when something looks wrong.
 *
 * A kind already owned does not queue a second, unplayable copy — it folds
 * into the one already hatched, gaining bond the way an adventure does, only
 * more of it. `PET_RANK_BONDS` in `pets.ts` is already the ceiling on what
 * that bond can reach, so nothing here needs a ceiling of its own.
 */
export async function buyEgg(
  coupleId: string,
  memberId: MemberId,
  rolls: { rarity: number; species: number },
  luck: number,
  victoryBonus = 0,
): Promise<HatchResult> {
  return db.transaction('rw', db.avatars, db.pets, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const check = canAfford(avatar.coins, EGG_PRICE);
    if (!check.ok) return { ok: false, reason: check.reason };

    const paid = spend(avatar, { coins: EGG_PRICE }, now());
    if (!paid) return { ok: false, reason: 'Not enough coins.' };
    await db.avatars.put(paid);

    const kind = rollKind(rolls.rarity, rolls.species, luck, victoryBonus);
    const existing = await db.pets.where('[memberId+kindId]').equals([memberId, kind.id]).first();

    if (existing) {
      const merged: PetInstance = {
        ...existing,
        bond: existing.bond + DUPLICATE_PET_BOND,
        updatedAt: now(),
      };
      await db.pets.put(merged);
      return { ok: true, pet: merged, merged: true };
    }

    const pet: PetInstance = {
      id: id(),
      coupleId,
      memberId,
      kindId: kind.id,
      bond: 0,
      mp: 0,
      hatchedAt: now(),
      updatedAt: now(),
    };
    await db.pets.put(pet);
    return { ok: true, pet };
  });
}

/** The lore is a reveal, so the moment it is shown is recorded, not assumed. */
export async function markLoreSeen(petId: string): Promise<void> {
  const pet = await db.pets.get(petId);
  if (!pet || pet.loreSeenAt) return;
  await db.pets.put({ ...pet, loreSeenAt: now(), updatedAt: now() });
}

export async function setCompanion(
  memberId: MemberId,
  coupleId: string,
  petId: string | undefined,
): Promise<void> {
  const avatar = await getOrCreateAvatar(memberId, coupleId);
  await db.avatars.put({ ...avatar, companionId: petId, updatedAt: now() });
}

/** MP out, for a skill cast in a boss fight. Returns false rather than a debt. */
export async function spendMp(
  memberId: MemberId,
  coupleId: string,
  amount: number,
): Promise<boolean> {
  const avatar = await getOrCreateAvatar(memberId, coupleId);
  const paid = spend(avatar, { mp: amount }, now());
  if (!paid) return false;
  await db.avatars.put(paid);
  return true;
}

export async function spendPetMp(petId: string, amount: number): Promise<boolean> {
  const pet = await db.pets.get(petId);
  if (!pet || pet.mp < amount) return false;
  await db.pets.put({ ...pet, mp: pet.mp - amount, updatedAt: now() });
  return true;
}

/** Fighting alongside you is worth as much bond as a day of tasks. */
export async function bondPet(petId: string, amount: number): Promise<void> {
  const pet = await db.pets.get(petId);
  if (!pet) return;
  await db.pets.put({ ...pet, bond: pet.bond + Math.max(0, amount), updatedAt: now() });
}

export interface AdventureResult {
  ok: boolean;
  reason?: string;
  hours?: number;
  /** Where they went, when somewhere was named. */
  place?: string;
  /** What came home — flavour, one line. See `findAt` in `locations.ts`. */
  found?: string;
  /** The arrival bounty, paid only on a first visit. */
  bounty?: number;
}

/**
 * Energy out, for a finished adventure. The pure spend lives in `avatar.ts`.
 *
 * `locationId` is optional, so the plain "send them out" button still works
 * exactly as it did — an adventure with nowhere named is the original
 * behaviour, unchanged. Naming a place adds a distance surcharge, a one-off
 * arrival bounty, and a line about what they brought back.
 *
 * `roll` is supplied by the caller rather than drawn here, the same rule the
 * pet drops follow: this stays deterministic given its inputs, so a test can
 * name the outcome instead of running it two hundred times and hoping.
 */
export async function startAdventure(
  memberId: MemberId,
  coupleId: string,
  locationId?: string,
  roll: number = 0,
): Promise<AdventureResult> {
  const place = placeById(locationId);
  if (locationId && !place) return { ok: false, reason: 'Nowhere by that name.' };

  const avatar = await getOrCreateAvatar(memberId, coupleId);
  const owned = await db.inventory.where('memberId').equals(memberId).toArray();
  const sheet = sheetFor(
    avatar,
    gearBonusWithRefinement(avatar.gear, levelOf(avatar), refineByItemId(owned)),
  );
  const cost = adventureCost(sheet.level, sheet.energy);

  if (place) {
    // Level before energy, so somebody is never told to rest up for somewhere
    // they cannot reach yet. See `canTravel`.
    const verdict = canTravel(place, sheet.level, sheet.energy, cost.energy);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
  } else if (cost.shortBy > 0) {
    return { ok: false, reason: `${cost.shortBy} more energy and they can go.` };
  }

  const energy = place ? travelCost(place, cost.energy) : cost.energy;
  const paid = spend(avatar, { energy }, now());
  if (!paid) return { ok: false, reason: 'Not enough energy yet.' };

  if (!place) {
    await db.avatars.put(paid);
    if (avatar.companionId) await bondPet(avatar.companionId, 2);
    return { ok: true, hours: cost.hours };
  }

  // First arrival pays the bounty and is remembered; every later visit is for
  // the trip itself. Written in the same put as the energy so a bounty cannot
  // be credited to a journey that failed to save.
  const first = isNewTo(avatar.visited, place.id);
  await db.avatars.put({
    ...paid,
    coins: paid.coins + (first ? place.bounty : 0),
    visited: first ? [...(avatar.visited ?? []), place.id] : avatar.visited,
  });
  if (avatar.companionId) await bondPet(avatar.companionId, 2);

  return {
    ok: true,
    hours: cost.hours,
    place: place.name,
    found: findAt(place, roll),
    bounty: first ? place.bounty : undefined,
  };
}
