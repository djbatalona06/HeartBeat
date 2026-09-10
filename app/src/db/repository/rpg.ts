import { db } from '../database';
import { DEFAULT_SETTINGS, type DayKey, type MemberId } from '../../domain/types';
import { addDays } from '../../domain/day';
import { starterPlanFor } from '../../domain/rpg/starterPlan';
import {
  newAvatar,
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
      const task = newTask(
        { id: id(), coupleId, memberId, type: 'daily', title: starter.title, difficulty: starter.difficulty },
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
  const tasks = await db.tasks.where('[memberId+type]').equals([memberId, 'daily']).toArray();
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

    await db.lifeEvents.put({
      id: id(),
      coupleId,
      memberId,
      kind,
      day,
      fromMemberId: options.fromMemberId,
      note: options.note,
      grantedAt: now(),
    });

    const payout = grantFor(kind);
    const recipient = await getOrCreateAvatar(memberId, coupleId);
    await db.avatars.put(applyPayout(recipient, payout, now()));

    // Sending is worth something too, or nobody sends.
    if (kind === 'good-vibes' && options.fromMemberId) {
      const sender = await getOrCreateAvatar(options.fromMemberId, coupleId);
      await db.avatars.put(applyPayout(sender, GOOD_VIBES_SENDER_GRANT, now()));
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

/** Energy in, from a finished adventure. The pure spend lives in `avatar.ts`. */
export async function startAdventure(
  memberId: MemberId,
  coupleId: string,
): Promise<{ ok: boolean; reason?: string; hours?: number }> {
  const avatar = await getOrCreateAvatar(memberId, coupleId);
  const owned = await db.inventory.where('memberId').equals(memberId).toArray();
  const sheet = sheetFor(
    avatar,
    gearBonusWithRefinement(avatar.gear, levelOf(avatar), refineByItemId(owned)),
  );
  const cost = adventureCost(sheet.level, sheet.energy);
  if (cost.shortBy > 0) {
    return { ok: false, reason: `${cost.shortBy} more energy and they can go.` };
  }
  const paid = spend(avatar, { energy: cost.energy }, now());
  if (!paid) return { ok: false, reason: 'Not enough energy yet.' };
  await db.avatars.put(paid);
  if (avatar.companionId) await bondPet(avatar.companionId, 2);
  return { ok: true, hours: cost.hours };
}
