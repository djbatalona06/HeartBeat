import { db, loadSettings, saveSettings } from './database';
import type {
  ChatMessage, CycleEntry, DayKey, ExerciseEntry, MemberId, MoodEntry, WorkEvent,
} from '../domain/types';
import { addDays } from '../domain/day';
import {
  newAvatar,
  type Avatar,
  type GearSlot,
  type LifeEventKind,
  type Payout,
  type Reward,
  type TaskDifficulty,
  type TaskType,
} from '../domain/rpg/types';
import {
  complete,
  newTask,
  pressDown,
  settleMissed,
  toneFor,
} from '../domain/rpg/task';
import { applyPayout, levelOf, sheetFor, spend } from '../domain/rpg/avatar';
import { adventureCost } from '../domain/rpg/stage';
import { GOOD_VIBES_SENDER_GRANT, checkGrant, grantFor } from '../domain/rpg/lifeEvents';
import { equip, gearBonus, unequip } from '../domain/rpg/gear';
import { maxPetMp, petKindById, rankOf, rollKind, type PetInstance } from '../domain/rpg/pets';

/**
 * Every write goes through here. Components call these and await them; the live
 * queries re-render on their own. Nothing in features/ touches Dexie directly.
 */

function id(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

/**
 * One mood row per member per day: logging twice edits the same row rather than
 * stacking, so a day always has a single answer.
 */
export async function putMood(
  memberId: MemberId,
  day: DayKey,
  values: Pick<MoodEntry, 'hunger' | 'joy' | 'moody'> & { note?: string },
): Promise<void> {
  const existing = await db.moods.where('[memberId+day]').equals([memberId, day]).first();
  await db.moods.put({
    id: existing?.id ?? id(),
    memberId,
    day,
    ...values,
    updatedAt: now(),
  });
}

export async function putExercise(
  memberId: MemberId,
  day: DayKey,
  values: Omit<ExerciseEntry, 'id' | 'memberId' | 'day' | 'updatedAt'>,
): Promise<void> {
  const existing = await db.exercises.where('[memberId+day]').equals([memberId, day]).first();
  await db.exercises.put({ id: existing?.id ?? id(), memberId, day, ...values, updatedAt: now() });
}

export async function putCycle(
  memberId: MemberId,
  day: DayKey,
  values: Omit<CycleEntry, 'id' | 'memberId' | 'day' | 'updatedAt'>,
): Promise<void> {
  const existing = await db.cycles.where('[memberId+day]').equals([memberId, day]).first();
  const row: CycleEntry = { id: existing?.id ?? id(), memberId, day, ...values, updatedAt: now() };
  // An empty draft is deleted rather than stored, so "nothing logged" and
  // "logged nothing" stay distinguishable via checkInComplete.
  if (!row.checkInComplete && !row.flow && !row.periodStart && !row.symptoms?.length && !row.notes) {
    if (existing) await db.cycles.delete(existing.id);
    return;
  }
  await db.cycles.put(row);
}

/**
 * A calendar event.
 *
 * Unlike mood, exercise and cycle — one row per member per day, upserted — a
 * day holds many events, so these are separate rows keyed by their own id and
 * found through the [memberId+day] index. Passing `eventId` edits in place;
 * omitting it creates one.
 *
 * When the sync client lands, a day still travels as a single `entries` row
 * whose payload is the day's WorkEvent[], because the D1 unique index is
 * (member_id, kind, day). Keeping the local shape as one row per event and
 * doing the grouping at the boundary means the screen never has to rewrite an
 * array to move one appointment.
 */
export async function putWorkEvent(
  memberId: MemberId,
  day: DayKey,
  values: Omit<WorkEvent, 'id' | 'memberId' | 'day' | 'updatedAt'>,
  eventId?: string,
): Promise<string> {
  const title = values.title.trim();
  if (!title) throw new Error('a calendar event needs a title');

  const rowId = eventId ?? id();
  await db.work.put({
    ...values,
    title,
    id: rowId,
    memberId,
    day,
    updatedAt: now(),
  });
  return rowId;
}

export async function removeWorkEvent(eventId: string): Promise<void> {
  await db.work.delete(eventId);
}

/**
 * Put a message in the thread before it has reached the server.
 *
 * It is written locally first and marked pending, so the thread shows what was
 * just said even on a train with no signal. `mine` is true by construction
 * here — you cannot optimistically send someone else's message.
 */
export async function draftMessage(
  coupleId: string,
  memberId: MemberId,
  body: string,
): Promise<ChatMessage | null> {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const row: ChatMessage = {
    id: id(),
    coupleId,
    memberId,
    body: trimmed,
    createdAt: now(),
    mine: true,
    pending: true,
  };
  await db.messages.put(row);
  return row;
}

/**
 * Replace a pending message with the server's version of it.
 *
 * The server assigns the real id and timestamp, so the local row is deleted
 * rather than updated — leaving both would show the message twice, which is
 * exactly what an optimistic send is supposed to avoid.
 */
export async function confirmMessage(localId: string, confirmed: ChatMessage): Promise<void> {
  await db.transaction('rw', db.messages, async () => {
    await db.messages.delete(localId);
    await db.messages.put({ ...confirmed, pending: false });
  });
}

/**
 * Fold a pull from the server into the local thread.
 *
 * Server ids win, so a message that arrives twice — a retried poll, a message
 * of our own coming back around — lands on the same row rather than stacking.
 */
export async function mergeMessages(rows: ChatMessage[]): Promise<void> {
  if (rows.length === 0) return;
  await db.messages.bulkPut(rows.map((r) => ({ ...r, pending: false })));
}

export async function addXp(coupleId: string, amount: number): Promise<void> {
  const pet = await db.pet.get(coupleId);
  await db.pet.put({
    coupleId,
    level: pet?.level ?? 1,
    xp: (pet?.xp ?? 0) + amount,
    mood: pet?.mood ?? 'content',
    fedAt: pet?.fedAt ?? now(),
  });
}

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

export async function equipItem(
  memberId: MemberId,
  coupleId: string,
  itemId: string,
): Promise<{ ok: boolean; reason?: string }> {
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
 * Hatch an egg. The rolls are passed in rather than taken here so the caller
 * owns the randomness and this stays testable — and so a drop can be replayed
 * exactly when something looks wrong.
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
  const sheet = sheetFor(avatar, gearBonus(avatar.gear, levelOf(avatar)));
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

/**
 * The app has to work on the phone that installed it first, before there is a
 * partner to pair with, so a solo identity is minted locally on first use.
 *
 * Pairing later replaces both ids with the ones the Worker issues. Rows written
 * before that point keep the provisional ids and would need re-keying — a real
 * loose end, recorded in docs/DESIGN.md rather than papered over here.
 */
export async function ensureIdentity(): Promise<{ memberId: MemberId; coupleId: string }> {
  const settings = await loadSettings();
  if (settings.memberId && settings.coupleId) {
    return { memberId: settings.memberId, coupleId: settings.coupleId };
  }
  const memberId = settings.memberId ?? id();
  const coupleId = settings.coupleId ?? id();
  await saveSettings({ memberId, coupleId });
  return { memberId, coupleId };
}
