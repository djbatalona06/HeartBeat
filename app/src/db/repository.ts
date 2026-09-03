import { db, loadSettings, saveSettings } from './database';
import type {
  ChatMessage, CycleEntry, DayKey, ExerciseEntry, MemberId, MoodEntry, Pet, PetXpAward,
  WorkEvent, WorkoutPhoto,
} from '../domain/types';
import { MAX_AWARD_XP } from '../domain/types';
import { addDays, dayKey } from '../domain/day';
import { instantAt } from '../domain/notify/schedule';
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
import { tierScale } from '../domain/rpg/boss';

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

/** One member's cycle log, ascending, for the calendar and the engine. */
export async function listCycles(
  memberId: MemberId,
  from: DayKey,
  to: DayKey,
): Promise<CycleEntry[]> {
  const rows = await db.cycles
    .where('[memberId+day]')
    .between([memberId, from], [memberId, to], true, true)
    .toArray();
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The whole log for one member.
 *
 * The engine needs every period start it can get — trimming to the visible
 * month would shorten the history the averages rest on, and the averages are
 * the whole estimate. One person's cycle log is a few hundred rows a year.
 */
export async function allCycles(memberId: MemberId): Promise<CycleEntry[]> {
  const rows = await db.cycles.where('memberId').equals(memberId).toArray();
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}

export async function getCycle(memberId: MemberId, day: DayKey): Promise<CycleEntry | undefined> {
  return db.cycles.where('[memberId+day]').equals([memberId, day]).first();
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

/**
 * A whole calendar import in one write.
 *
 * A year of somebody's calendar is a thousand rows, and a thousand awaited
 * `put`s is a thousand transactions — seconds of blocked screen on a phone,
 * and a half-written calendar if the browser drops the connection part way
 * through. One `bulkPut` is one transaction: it lands completely or not at
 * all. Ids come from the caller, so a re-import overwrites rather than doubles.
 */
export async function putWorkEvents(
  memberId: MemberId,
  events: readonly (Omit<WorkEvent, 'memberId' | 'updatedAt'>)[],
): Promise<void> {
  const at = now();
  const rows = events.map((event) => {
    const title = event.title.trim();
    if (!title) throw new Error('a calendar event needs a title');
    return { ...event, title, memberId, updatedAt: at };
  });
  await db.work.bulkPut(rows);
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

/**
 * XP into the shared pet.
 *
 * Two things are true here that were not before. The amount is clamped to a
 * gain: the pet is the couple's, and no ordinary day may take something away
 * from it, so a caller handing this a negative number moves nothing rather than
 * quietly billing both partners. And the gain is queued for the server as well
 * as written locally, because the pet was only ever shared in name — see the
 * banner at the end of this file.
 */
export async function addXp(coupleId: string, amount: number): Promise<void> {
  await awardPetXp(coupleId, id(), amount);
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
 * before that point keep the provisional ids; `rekeyIdentity` below carries
 * them over the moment that happens.
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

/* ---- shared pet xp ---- */

/**
 * The couple's pet was never actually shared.
 *
 * `db.pet` is not one of the sync client's KINDS, and the D1 `pets` row is
 * written once at pairing, with defaults, and read by nothing. So each phone's
 * bar showed that phone's own contributions under a heading that said "ours".
 *
 * The fix cannot be another last-write-wins row. XP is additive: two phones
 * each adding to it and pushing the result would silently discard one person's
 * gains, which is exactly the argument that put boss HP on the server. So an
 * award is queued here, flushed by `pwa/petSync.ts`, and summed by
 * `functions/api/pet.ts` under `xp = xp + ?`.
 *
 * Everything below is gain-only. Nothing here subtracts from the pet, and
 * nothing could without first teaching `awardPetXp` to accept a negative
 * number.
 */

/**
 * How many award ids a phone remembers. Long enough that a victory reported
 * twice over is recognised, short enough that the row stays small.
 */
export const PET_XP_AWARD_MEMORY = 32;

/**
 * One gain, counted once.
 *
 * The id is the whole point: an award that arrives again — a boss victory both
 * phones report, a retried flush — lands on the same id and is ignored, here
 * and on the server. The amount is clamped upward, so the pet has no path down.
 */
/**
 * Fold a phone's pre-feature XP into the shared total, once.
 *
 * Before the pet was shared, each phone's `pet.xp` was purely its own owner's
 * gains — the row was never synced, so nothing of the partner's was ever in it.
 * Summing the two is therefore exactly the couple's history, not a double count.
 *
 * The awards are queued without touching `xp`, because that total is already
 * sitting in it. They are chunked to the endpoint's per-award ceiling, since a
 * couple who have been using this for months will be well past it.
 *
 * Recognising a pre-feature row is the whole trick: it has XP, has never settled
 * with the server, and has no award history. A row that has flushed even once
 * fails that test and is left alone.
 */
export async function seedLegacyPetXp(coupleId: string, memberId: MemberId): Promise<number> {
  return db.transaction('rw', db.pet, async () => {
    const pet = await db.pet.get(coupleId);
    if (!pet || pet.xp <= 0) return 0;
    if (pet.sharedXp !== undefined) return 0;
    if ((pet.awardedXpIds ?? []).length > 0) return 0;
    if ((pet.pendingXp ?? []).length > 0) return 0;

    const at = now();
    const awards: PetXpAward[] = [];
    let left = Math.floor(pet.xp);
    for (let part = 0; left > 0; part += 1) {
      const amount = Math.min(left, MAX_AWARD_XP);
      awards.push({ id: `seed-${memberId}-${part}`, amount, awardedAt: at });
      left -= amount;
    }

    await db.pet.put({
      ...pet,
      // `xp` deliberately unchanged: these are not new gains, they are the ones
      // already on the bar, told to the server for the first time.
      pendingXp: awards,
      sharedXp: 0,
      awardedXpIds: awards.map((a) => a.id).slice(-PET_XP_AWARD_MEMORY),
    });
    return awards.length;
  });
}

export async function awardPetXp(
  coupleId: string,
  awardId: string,
  amount: number,
): Promise<void> {
  // Not finite is not a gain. A NaN reaching the row would poison `xp` for
  // good — every later comparison against it is false, so the bar would never
  // move again — and the queued award would be refused by the endpoint on
  // every flush from then on.
  const gain = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;

  // Read and write in one transaction: a flush settling at the same moment
  // does the same read-modify-write on this row, and outside a transaction the
  // later `put` would carry the earlier one's `pendingXp` and drop this award.
  await db.transaction('rw', db.pet, async () => {
    const pet = await db.pet.get(coupleId);
    const counted = pet?.awardedXpIds ?? [];
    if (counted.includes(awardId)) return;

    await db.pet.put({
      coupleId,
      level: pet?.level ?? 1,
      // The bar moves now rather than when the network comes back: the award is
      // already on the queue, and a flush only ever raises this further.
      xp: (pet?.xp ?? 0) + gain,
      mood: pet?.mood ?? 'content',
      fedAt: pet?.fedAt ?? now(),
      pendingXp: [...(pet?.pendingXp ?? []), { id: awardId, amount: gain, awardedAt: now() }],
      sharedXp: pet?.sharedXp ?? 0,
      awardedXpIds: [...counted, awardId].slice(-PET_XP_AWARD_MEMORY),
    });
  });
}

/**
 * What clearing a tier is worth to the pet.
 *
 * Scaled by the same `tierScale` the fight itself uses, so the reward tracks
 * the fight without a second table of boss numbers to keep in step with
 * `worker/src/boss.ts`. The base is a little over a level from cold.
 */
export const BOSS_VICTORY_XP = 120;

export function bossVictoryXp(tier: number): number {
  // Capped at what one award may carry. The curve passes the endpoint's ceiling
  // around tier 18, and an award over it is refused on its merits — so without
  // this the reward for the hardest fight in the game is the only one that
  // never arrives.
  return Math.min(MAX_AWARD_XP, Math.round(BOSS_VICTORY_XP * tierScale(tier)));
}

/**
 * A cleared tier, paid to the shared pet.
 *
 * The id is the fight, not the phone: both partners were in it, both phones see
 * the victory, and both will report it. `boss-<tier>` makes those two reports
 * one award — and a tier is cleared once, since only a victory advances the
 * tier and a defeat re-runs it.
 */
export async function awardBossVictory(coupleId: string, tier: number): Promise<void> {
  const cleared = Math.max(1, Math.floor(tier));
  await awardPetXp(coupleId, `boss-${cleared}`, bossVictoryXp(cleared));
}

export interface PetXpNumbers {
  xp: number;
  sharedXp: number;
  pendingXp: PetXpAward[];
}

/**
 * Fold a flush's answer back into the local row.
 *
 * The numbers are decided by `mergePetXp` in `pwa/petSync.ts`, which is where
 * the rule that none of them may fall is written down and tested. It is handed
 * in as a function rather than as numbers on purpose: a round trip takes long
 * enough for a task to be ticked off mid-flight, and merging against the row
 * read before the request would write that award's XP back out of existence —
 * and its id is already in `awardedXpIds`, so nothing would ever re-add it.
 * Reading, merging and writing inside one transaction is what makes the answer
 * apply to the row as it is now.
 */
export async function settlePetXp(
  coupleId: string,
  merge: (pet: Pet | undefined) => PetXpNumbers,
): Promise<PetXpNumbers> {
  return db.transaction('rw', db.pet, async () => {
    const pet = await db.pet.get(coupleId);
    const next = merge(pet);
    await db.pet.put({
      coupleId,
      level: pet?.level ?? 1,
      mood: pet?.mood ?? 'content',
      fedAt: pet?.fedAt ?? now(),
      awardedXpIds: pet?.awardedXpIds ?? [],
      ...next,
    });
    return next;
  });
}

/* ---- identity repair ---- */

// Imports are hoisted, so this one sits with the section it belongs to rather
// than at the top of a file three other screens are editing this week.
import {
  REKEY_TABLES,
  carriesIdentity,
  isUsableIdentity,
  needsWholeTable,
  planRekey,
  sameIdentity,
  type Identity,
  type RekeyRow,
} from '../domain/identity/rekey';

/**
 * Carry this device's rows over when its identity changes.
 *
 * `ensureIdentity` above mints a provisional pair on first use and pairing
 * replaces both, which left everything logged before pairing wearing ids nobody
 * has: never synced, never in a "mine" view again. This is the repair for that,
 * and for the same thing happening again if the couple ever re-pairs.
 *
 * What moves where is `domain/identity/rekey.ts` — it is pure, so the awkward
 * parts (a primary key that is itself an id, a day that already has an answer)
 * are decided somewhere they can be tested. This walks the plan inside one
 * transaction so a phone that dies halfway does not wake up half re-keyed.
 *
 * Idempotent: a second run finds no row still carrying `from` and writes
 * nothing. Returns how many rows it touched.
 */
export async function rekeyIdentity(from: Identity, to: Identity): Promise<number> {
  if (!isUsableIdentity(from) || !isUsableIdentity(to)) return 0;
  if (sameIdentity(from, to)) return 0;

  // The sync watermarks belonged to the identity being left, so they go with
  // it. `syncPushedAt` especially: a re-keyed row keeps the `updatedAt` it was
  // written with, which on a re-pair is older than the watermark, so the row
  // would sit below it and never be offered to the server — the same silence
  // this repair exists to end. Starting both from zero is safe in both
  // directions, because push and pull each settle on the newer `updatedAt`.
  await saveSettings({ syncPushedAt: 0, syncPulledAt: 0 });

  // A planned table the schema does not have yet — one arriving with a later
  // version — is skipped rather than thrown over.
  const present = new Set(db.tables.map((table) => table.name));
  const plans = REKEY_TABLES.filter((plan) => present.has(plan.table));

  return db.transaction('rw', plans.map((plan) => plan.table), async () => {
    let touched = 0;
    for (const plan of plans) {
      const table = db.table<RekeyRow, unknown>(plan.table);
      // Only the tables whose plan can collide are read whole. `workoutPhotos`
      // holds a data URI per row, and pulling every one into memory to decide
      // nothing is how a re-pair after a year of proofs runs a phone out of it.
      const rows = needsWholeTable(plan)
        ? await table.toArray()
        : await table.filter((row) => carriesIdentity(row, plan, from)).toArray();
      for (const action of planRekey(plan, rows, from, to)) {
        if (action.verb === 'put') {
          await table.put(action.row);
        } else if (action.verb === 'move') {
          // The key is the id, so the row cannot be updated where it lies.
          await table.delete(action.oldKey);
          await table.put(action.row);
        } else {
          await table.delete(action.oldKey);
        }
        touched += 1;
      }
    }
    return touched;
  });
}

/* ---- workout photos ------------------------------------------------------- */

/**
 * Camera proof for a day's workout: one row per member, per day, per camera.
 *
 * Upserted on `[memberId+day]` the way mood and exercise are, with `facing`
 * narrowing it further — retaking the back-camera shot replaces the back-camera
 * shot and leaves the front one where it was.
 *
 * The row is deliberately not part of the exercise entry: an exercise payload
 * is held to 64 KiB and a photograph is not. `pwa/sync.ts` now carries these
 * rows as their own entry kind, `photo`, which has its own 512 KiB ceiling —
 * so a day of proof travels without a mood or a cycle row riding on its size.
 * A day travels whole, both cameras in one payload, because the server's unique
 * index is (member, kind, day).
 */
export async function putWorkoutPhoto(
  memberId: MemberId,
  day: DayKey,
  values: Omit<WorkoutPhoto, 'id' | 'memberId' | 'day' | 'updatedAt'>,
): Promise<void> {
  const sameDay = await db.workoutPhotos.where('[memberId+day]').equals([memberId, day]).toArray();
  const existing = sameDay.find((row) => row.facing === values.facing);
  await db.workoutPhotos.put({
    id: existing?.id ?? id(),
    memberId,
    day,
    ...values,
    updatedAt: now(),
  });
}

/**
 * Deleting one camera's shot leaves the other one where it is.
 *
 * The shot that stays has its `updatedAt` bumped, which looks redundant and is
 * not: sync dates a day of proof by the newest shot still in it, so a delete
 * that touched nothing would leave the day's timestamp below the watermark and
 * the removal would never be offered to the server — the partner's phone would
 * go on showing a photograph that no longer exists here.
 */
export async function removeWorkoutPhoto(
  memberId: MemberId,
  day: DayKey,
  facing: WorkoutPhoto['facing'],
): Promise<void> {
  const sameDay = await db.workoutPhotos.where('[memberId+day]').equals([memberId, day]).toArray();
  const doomed = sameDay.find((row) => row.facing === facing);
  if (!doomed) return;
  await db.workoutPhotos.delete(doomed.id);

  const at = now();
  await db.workoutPhotos.bulkPut(
    sameDay.filter((row) => row.id !== doomed.id).map((row) => ({ ...row, updatedAt: at })),
  );
}

/* ---- members ------------------------------------------------------------- */

/**
 * The two people, and the handful of settings the Settings screen owns.
 *
 * The members table has existed since v1 of the schema and nothing had ever
 * written to it, so a paired couple had two ids and no names. These are its
 * first writers. Both rows live on both phones: mine because I edited it,
 * theirs because /api/profile served it — which is what lets a partner's name
 * and face render with the network off, like everything else here.
 *
 * The wire shape is spelled out locally rather than imported so this section
 * stays self-contained; it is the JSON /api/profile returns, not the Dexie row.
 */
export interface IncomingMember {
  id: MemberId;
  coupleId: string;
  displayName: string;
  /**
   * Optional because /api/profile deliberately does not serve it: cycle
   * ownership is answered on the device, and the endpoint says so in as many
   * words. Declaring it required only made TypeScript agree with a field that
   * never arrives.
   */
  tracksCycle?: boolean;
  photoDataUri?: string;
  updatedAt: number;
}

/** Longer than anyone's name, short enough that it cannot be used as a note. */
export const MAX_DISPLAY_NAME = 40;

/**
 * What pairing hands back, written in one place so no screen has to remember
 * that three of these four fields are what "paired" means.
 *
 * The invite is kept because a reload should not lose a code that is still
 * good — the person reading it out has walked into the next room by then.
 */
export async function savePairing(result: {
  coupleId: string;
  memberId: MemberId;
  token: string;
  invite?: string;
  expiresAt?: number;
}): Promise<void> {
  await saveSettings({
    coupleId: result.coupleId,
    memberId: result.memberId,
    workerSecret: result.token,
    pendingInvite: result.invite,
    pendingInviteExpiresAt: result.expiresAt,
  });
}

/** Both halves of the couple are together; the code has done its job. */
export async function clearPendingInvite(): Promise<void> {
  await saveSettings({ pendingInvite: undefined, pendingInviteExpiresAt: undefined });
}

/**
 * The durable half of the theme choice. ThemeProvider writes localStorage for
 * the first paint; this is the copy that outlives site data being cleared.
 */
export async function setThemeChoice(themeId: string): Promise<void> {
  await saveSettings({ themeId });
}

export async function setCalmMode(calmMode: boolean): Promise<void> {
  await saveSettings({ calmMode });
}

/**
 * Cycle ownership has one answer, and it is this one. `Member.tracksCycle` is
 * copied from it so the couple's rows are complete, and is never read back to
 * decide anything — see the note on Settings.tracksCycle.
 */
export async function setTracksCycle(tracksCycle: boolean): Promise<void> {
  await saveSettings({ tracksCycle });
  const { memberId, coupleId } = await ensureIdentity();
  const existing = await db.members.get(memberId);
  await db.members.put({
    id: memberId,
    coupleId,
    displayName: existing?.displayName ?? '',
    photoDataUri: existing?.photoDataUri,
    tracksCycle,
    updatedAt: now(),
  });
}

/**
 * My own name and face.
 *
 * `photoDataUri: null` means "take it off", which is different from leaving it
 * out — a patch that omits the photo must not silently delete one.
 */
export async function putMyProfile(patch: {
  displayName?: string;
  photoDataUri?: string | null;
}): Promise<IncomingMember> {
  const { memberId, coupleId } = await ensureIdentity();
  const settings = await loadSettings();
  const existing = await db.members.get(memberId);
  const photo = patch.photoDataUri === undefined ? existing?.photoDataUri : patch.photoDataUri;
  const row = {
    id: memberId,
    coupleId,
    displayName: (patch.displayName ?? existing?.displayName ?? '')
      .trim()
      .slice(0, MAX_DISPLAY_NAME),
    tracksCycle: settings.tracksCycle === true,
    photoDataUri: photo ?? undefined,
    updatedAt: now(),
  };
  await db.members.put(row);
  return row;
}

/**
 * Rows the server served. Newer wins, decided by the row's own `updatedAt` on
 * both sides — the same rule pwa/sync.ts uses, so an edit made on this phone
 * while it was offline is not undone by an older copy coming back.
 */
export async function saveMembersFromServer(rows: IncomingMember[]): Promise<number> {
  let applied = 0;
  for (const row of rows) {
    const existing = await db.members.get(row.id);
    if (existing && existing.updatedAt >= row.updatedAt) continue;
    await db.members.put({
      id: row.id,
      coupleId: row.coupleId,
      displayName: row.displayName,
      // The server does not serve this one, so a served row must not erase the
      // copy `setTracksCycle` mirrors here — otherwise saving a name blanks it.
      tracksCycle: row.tracksCycle ?? existing?.tracksCycle ?? false,
      photoDataUri: row.photoDataUri,
      updatedAt: row.updatedAt,
    });
    applied += 1;
  }
  return applied;
}

/* ---- quests --------------------------------------------------------------- */

/**
 * The couple's quest, and the one place it is paid for.
 *
 * `quests` is the other table that has been in the schema since v1 with nothing
 * writing to it. `domain/quests/` decides; this composes it with one write, and
 * `domain/xp.ts`'s `questComplete`/`awardFor` — which have been sitting there
 * without a caller since the repository began — do the arithmetic.
 *
 * The rule everything below serves: **a quest pays out once, on the transition
 * to complete.** `completedAt` records the transition and `reckon` refuses to
 * award a quest carrying it, so the danger is not the rule but the gap between
 * reading a quest and writing it back. `reconcileQuests` therefore re-reads the
 * row inside the transaction it writes in: two overlapping reconciles — which a
 * live query firing on this function's own writes will produce — cannot both
 * see an unpaid quest.
 *
 * Progress is measured rather than incremented. Counting the days a quest's
 * measure names, every time, means a workout logged while the app was closed,
 * or a row that arrived by sync, lands in the quest anyway; an increment hung
 * off `completeTask` would simply have been missed.
 */
import {
  advance,
  markComplete,
  markRetired,
  newQuest,
  reckon,
  seedFrom,
  suggestDifficulty,
  type RecentDays,
} from '../domain/quests/engine';
import {
  QUEST_TEMPLATES,
  shapeFor,
  shapesAt,
  templateById,
  type QuestMeasure,
  type QuestShape,
} from '../domain/quests/templates';
import type { Quest, QuestDifficulty } from '../domain/types';

/** How far back `suggest` looks when guessing what to offer. */
const SEED_WINDOW_DAYS = 14;

/** The instant a day is over, so `expiresAt` keeps meaning what it always did. */
function endOfDay(day: DayKey, timeZone: string): number {
  // The day key is derived in the member's zone, so its end has to be too:
  // ending a London quest at midnight UTC cuts an hour off its last day in
  // summer, and a Los Angeles one loses most of an afternoon.
  const midnight = instantAt(day, 0, timeZone);
  return instantAt(addDays(day, 1), 0, timeZone) - 1 || midnight;
}


/**
 * How many days of each measure fall inside a window.
 *
 * Every table here holds one couple's rows and no one else's, so both people's
 * days count towards the quest — it belongs to the couple, like the pet it
 * feeds and unlike a task.
 */
async function daysByMeasure(
  timeZone: string,
  from?: DayKey,
  to?: DayKey,
): Promise<Record<QuestMeasure, number>> {
  const inWindow = (day: DayKey | undefined): day is DayKey =>
    Boolean(day) && (!from || day! >= from) && (!to || day! <= to);

  /**
   * Distinct days a table has rows on, streamed.
   *
   * `workoutPhotos` carries a base64 JPEG per row, so reading the table into an
   * array to look at each `day` is how a phone with a year of proof runs out of
   * memory — and this runs on every reconcile and every live-query re-fire.
   */
  const daysOf = async (
    table: { each(fn: (row: { day?: string }) => void): Promise<unknown> },
  ): Promise<number> => {
    const days = new Set<DayKey>();
    await table.each((row) => { if (inWindow(row.day)) days.add(row.day as DayKey); });
    return days.size;
  };

  const [moodDays, exerciseDays, proofDays, cycleDays, planDays, tasks, notes] = await Promise.all([
    daysOf(db.moods),
    daysOf(db.exercises),
    daysOf(db.workoutPhotos),
    daysOf(db.cycles),
    // The day the entry was *written*, not the day it is for. A calendar holds
    // next week's dentist appointment; counting by the day it happens meant two
    // things already in the diary finished the quest on its first reconcile and
    // paid out for work nobody did during the week.
    (async () => {
      const days = new Set<DayKey>();
      await db.work.each((row) => {
        const on = dayKey(new Date(row.updatedAt), timeZone);
        if (inWindow(on)) days.add(on);
      });
      return days.size;
    })(),
    db.tasks.toArray(),
    (async () => {
      const days = new Set<DayKey>();
      // In the member's zone, like every other day key here. Deriving this one
      // in UTC put an evening note on the following day for anyone west of
      // Greenwich, so a note written on the quest's last evening never counted.
      await db.messages.each((m) => {
        const on = dayKey(new Date(m.createdAt), timeZone);
        if (inWindow(on)) days.add(on);
      });
      return days.size;
    })(),
  ]);

  return {
    moodDays,
    exerciseDays,
    proofDays,
    cycleDays,
    planDays,
    // Distinct tasks whose most recent completion falls in the window. A task
    // records only that one date, so this cannot be a count of days — see the
    // note on the `finish` template, which is worded to match.
    tasksFinished: tasks.filter((t) => inWindow(t.lastCompletedOn)).length,
    noteDays: notes,
  };
}

/** The couple's quest, if they have one running. */
export async function activeQuest(coupleId: string): Promise<Quest | undefined> {
  const rows = await db.quests.where('coupleId').equals(coupleId).toArray();
  return rows.find((q) => !q.completedAt && !q.retiredAt);
}

/** Everything they have finished or let go, newest first. */
export async function pastQuests(coupleId: string): Promise<Quest[]> {
  const rows = await db.quests.where('coupleId').equals(coupleId).toArray();
  return rows
    .filter((q) => q.completedAt || q.retiredAt)
    .sort((a, b) => (b.completedAt ?? b.retiredAt ?? 0) - (a.completedAt ?? a.retiredAt ?? 0));
}

export interface QuestSuggestion {
  difficulty: QuestDifficulty;
  shapes: QuestShape[];
}

/**
 * What to offer, ordered by what they already do.
 *
 * The difficulty is a starting point rather than a decision — the picker shows
 * all three, and this only says which one it opens on.
 */
export async function suggestQuests(today: DayKey): Promise<QuestSuggestion> {
  const from = addDays(today, -SEED_WINDOW_DAYS);
  const { timeZone } = await loadSettings();
  const recent = (await daysByMeasure(timeZone, from, today)) as RecentDays;
  const difficulty = suggestDifficulty(recent);
  return { difficulty, shapes: seedFrom(shapesAt(difficulty), recent, SEED_WINDOW_DAYS) };
}

/**
 * Take one on.
 *
 * One at a time, on purpose: a list of quests is a backlog, and the point of a
 * quest is that it is the thing you are doing this week. Starting a new one
 * while another runs is refused rather than silently retiring the old one,
 * because losing a week's progress to a mis-tap is not recoverable.
 */
export async function startQuest(
  coupleId: string,
  templateId: string,
  difficulty: QuestDifficulty,
  today: DayKey,
): Promise<Quest | null> {
  const template = templateById(templateId);
  if (!template) return null;

  const { timeZone } = await loadSettings();

  return db.transaction('rw', [db.quests], async () => {
    const rows = await db.quests.where('coupleId').equals(coupleId).toArray();
    if (rows.some((q) => !q.completedAt && !q.retiredAt)) return null;

    const quest = newQuest(shapeFor(template, difficulty), coupleId, today, id(),
      (day) => endOfDay(day, timeZone));
    await db.quests.put(quest);
    return quest;
  });
}

/** Let one go early. Nothing is taken — the row is stamped and stops counting. */
export async function retireQuest(questId: string): Promise<void> {
  await db.transaction('rw', [db.quests], async () => {
    const quest = await db.quests.get(questId);
    if (!quest || quest.completedAt || quest.retiredAt) return;
    await db.quests.put(markRetired(quest, now()));
  });
}

/**
 * The zone is a parameter rather than something read from `settings` here, and
 * that is not tidiness. `QuestBoard` calls this inside a `useLiveQuery`, and a
 * Dexie live query subscribes to every table its body touches — `sync()`
 * rewrites the settings row at the end of every round, up to twenty rounds per
 * foreground, and each rewrite would re-stream `moods`, `exercises`,
 * `workoutPhotos`, `cycles`, `work`, `tasks` and `messages`. That is exactly
 * the cost `daysOf` streams to avoid, paid twenty times over.
 */
export interface QuestReading {
  quest?: Quest;
  /** Days counted for that quest's measure, inside its own window. */
  measured: number;
}

/**
 * The running quest and how far along it actually is.
 *
 * A read, so a screen can put it in a live query — and it must, because the
 * tables this touches are the ones a quest counts. A live query watching only
 * `quests` would never re-fire when a workout is logged, so the quest would sit
 * unreconciled until something else happened to write to it. Reading moods,
 * exercises and the rest *here* is what subscribes the caller to them.
 */
export async function measureQuest(coupleId: string, timeZone: string): Promise<QuestReading> {
  const rows = await db.quests.where('coupleId').equals(coupleId).toArray();
  const quest = rows.find((q) => !q.completedAt && !q.retiredAt);
  if (!quest) return { measured: 0 };

  const template = templateById(quest.templateId);
  if (!template) return { quest, measured: quest.progress };

  const counted = await daysByMeasure(timeZone, quest.startedOn, quest.endsOn);
  return { quest, measured: counted[template.measure] ?? 0 };
}

export interface QuestReckoning {
  quest?: Quest;
  /** Non-zero only on the reconcile that saw the transition to complete. */
  awarded: number;
  finished: boolean;
  expired: boolean;
}

/**
 * Bring the running quest up to date with what has actually happened.
 *
 * Safe to call as often as anything likes. With no quest, nothing new, or a
 * quest already settled, it writes nothing at all.
 */
export async function reconcileQuests(
  coupleId: string,
  today: DayKey,
  timeZone: string,
): Promise<QuestReckoning> {
  const { quest: running, measured } = await measureQuest(coupleId, timeZone);
  if (!running) return { awarded: 0, finished: false, expired: false };
  if (!templateById(running.templateId)) {
    return { quest: running, awarded: 0, finished: false, expired: false };
  }

  return db.transaction('rw', [db.quests, db.pet], async () => {
    // Re-read inside the transaction. The value fetched above is only a count;
    // whether this quest has already been paid is decided here, where a second
    // overlapping call cannot see a stale answer.
    const fresh = await db.quests.get(running.id);
    if (!fresh) return { awarded: 0, finished: false, expired: false };

    const step = reckon(advance(fresh, measured), today);

    if (step.verb === 'complete') {
      await db.quests.put(markComplete(step.quest, now()));
      // Named after the quest for the same reason the rungs are: an award id
      // the server has already seen is one it will not credit again.
      await awardPetXp(coupleId, `quest-${step.quest.id}`, step.award);
      return { quest: step.quest, awarded: step.award, finished: true, expired: false };
    }

    if (step.verb === 'expired') {
      await db.quests.put(markRetired(step.quest, now()));
      return { quest: step.quest, awarded: 0, finished: false, expired: true };
    }

    // Running, or already settled by whoever got here first.
    if (step.verb === 'running' && step.quest !== fresh) await db.quests.put(step.quest);
    return { quest: step.quest, awarded: 0, finished: false, expired: false };
  });
}

/** The templates, for a picker that wants to show what is on offer. */
export { QUEST_TEMPLATES };
/* ---- achievements --------------------------------------------------------- */

/**
 * The shelf's one writer.
 *
 * `achievements` has existed since v1 of the schema and nothing had ever put a
 * row in it. This is its first writer, and the only one: everything else about
 * achievements is pure, in `domain/achievements/`.
 *
 * Two things about the shape below are load-bearing.
 *
 * The stored codes are read *inside* the transaction that writes them. The
 * caller is a live query, which re-fires whenever a table it watches changes —
 * including the writes this function is making. Taking "what is already
 * unlocked" as an argument, or reading it before the transaction opened, means
 * a second call that overlaps the first sees a shelf that is already out of
 * date and pays the same rung again. Dexie serialises transactions touching the
 * same table, so reading within is what makes the second call find nothing.
 *
 * The counters are gathered before the transaction, and deliberately: holding a
 * write lock across a dozen tables to read numbers off them is a great deal of
 * blocking for no guarantee. A counter that is a moment stale can only ever
 * under-award, and the next call — which any of these writes will trigger —
 * picks it up. Over-awarding is the failure that matters, and that is the one
 * the transaction prevents.
 *
 * The XP is added through `addXp`, so the shared pet stays the only place
 * achievement XP can land. There is no second arithmetic here to disagree with
 * the one every other payout uses.
 *
 * The imports sit here rather than at the top of the file on purpose: this
 * section is one clean append, and imports hoist, so it costs nothing.
 */
import { ACHIEVEMENTS, type AchievementDef } from '../domain/achievements/catalogue';
import { countGear, newlyEarned, payoutFor, stateFrom } from '../domain/achievements/unlock';
import { levelForXp } from '../domain/xp';
import type { Achievement } from '../domain/types';

/** What a claim did, so a screen can say so without re-deriving it. */
export interface ClaimResult {
  unlocked: AchievementDef[];
  xp: number;
}

/**
 * Count the calendar days a table has rows on.
 *
 * Days, not rows, and not member-days either. Every "days" blurb in the
 * catalogue promises the calendar — "Sixty days of saying how it was" — and a
 * couple where both people log produces two rows for one day, so counting rows
 * hands the sixty-day rung over on the thirtieth. Counting member-days has the
 * same fault. `daysByMeasure` in the quests section counts distinct days for
 * exactly these measures; this is the same rule, said once more.
 *
 * Streamed rather than read into an array: `workoutPhotos` carries a base64
 * JPEG per row, and pulling every one of them into memory to look at its `day`
 * is how a phone with a year of proof runs out of it.
 */
async function daysOn(table: { each(fn: (row: { day?: string }) => void): Promise<unknown> }): Promise<number> {
  const days = new Set<string>();
  await table.each((row) => { if (row.day) days.add(row.day); });
  return days.size;
}

/**
 * Everything the rungs are measured against.
 *
 * Every table read here holds one couple's rows and no one else's, so a count
 * is the couple's count. Achievements are the couple's rather than one
 * person's: the row carries a coupleId and no memberId, and the shelf is
 * shared.
 */
export async function achievementState(coupleId: string) {
  const [
    moodDays, exerciseDays, proofDays, events, cycleDays, notes,
    vibesSent, tasks, avatars, pets, pet,
  ] = await Promise.all([
    daysOn(db.moods),
    daysOn(db.exercises),
    daysOn(db.workoutPhotos),
    // Entries, not days: this track is blurbed "Twenty things planned" and
    // "A hundred entries on the calendar", so three appointments on one
    // Saturday are three. `messages` below is a row count for the same reason.
    // The quest engine's `planDays` counts days because it asks a different
    // question — how many days you *added* something to the calendar.
    db.work.count(),
    daysOn(db.cycles),
    // Notes carry a timestamp rather than a day, and "a hundred and fifty
    // notes" is a count of notes, so this one stays a row count on purpose.
    db.messages.count(),
    // `kind` is not an index on this table, so this is a scan rather than a
    // lookup. It is a handful of rows and adding an index would mean a Dexie
    // version bump for a counter.
    db.lifeEvents.filter((e) => e.kind === 'good-vibes').count(),
    db.tasks.toArray(),
    db.avatars.toArray(),
    db.pets.count(),
    db.pet.get(coupleId),
  ]);

  return stateFrom({
    moodDays,
    exerciseDays,
    proofDays,
    events,
    cycleDays,
    notes,
    vibesSent,
    pets,
    tasks,
    // The fullest either sheet has been dressed, not the sum: "every slot
    // filled" is a thing one character does, not a total across two.
    gear: avatars.reduce<Record<string, string | undefined>>(
      (best, a) => (countGear(a.gear) > countGear(best) ? a.gear : best),
      {},
    ),
    petLevel: pet ? levelForXp(pet.xp) : 0,
  });
}

/**
 * Award every rung the couple has reached and not yet been given.
 *
 * Safe to call as often as anything likes: with nothing new it reads, finds no
 * codes, and writes nothing at all — not even the XP.
 */
export async function claimAchievements(coupleId: string): Promise<ClaimResult> {
  const state = await achievementState(coupleId);

  return db.transaction('rw', [db.achievements, db.pet], async () => {
    const stored = await db.achievements.where('coupleId').equals(coupleId).toArray();
    const fresh = newlyEarned(state, stored.map((row) => row.code));
    if (fresh.length === 0) return { unlocked: [], xp: 0 };

    const at = now();
    const rows: Achievement[] = fresh.map((def) => ({
      id: id(),
      coupleId,
      code: def.code,
      xp: payoutFor([def]),
      unlockedAt: at,
    }));
    await db.achievements.bulkPut(rows);

    // One award per rung, named after the rung rather than at random.
    // Achievements are the couple's and both phones evaluate them off the same
    // synced data, so both reach mood.2 and both report it. A random id makes
    // those two reports two credits on the shared pet; a derived one makes them
    // the same award, which is the shape `awardBossVictory` already uses and
    // the reason `pet_xp_awards` is keyed the way it is. It also makes a
    // re-claim on this phone a no-op, since `awardPetXp` knows the id already.
    for (const def of fresh) await awardPetXp(coupleId, `ach-${def.code}`, payoutFor([def]));

    const xp = payoutFor(fresh);
    return { unlocked: fresh, xp };
  });
}

/** Everything the couple has been given, newest first. */
export async function listAchievements(coupleId: string): Promise<Achievement[]> {
  const rows = await db.achievements.where('coupleId').equals(coupleId).toArray();
  return rows.sort((a, b) => b.unlockedAt - a.unlockedAt);
}

/** The catalogue, so a screen can show what is still ahead. */
export { ACHIEVEMENTS };
