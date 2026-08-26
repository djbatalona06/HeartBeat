import { db } from './database';
import type { CycleEntry, DayKey, ExerciseEntry, MemberId, MoodEntry } from '../domain/types';

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
