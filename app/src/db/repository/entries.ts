import { db } from '../database';
import type {
  CycleEntry,
  DayKey,
  ExerciseEntry,
  MemberId,
  MoodEntry,
  WorkEvent,
} from '../../domain/types';
import { id, now } from './shared';


/**
 * One mood row per member per day: logging twice edits the same row rather than
 * stacking, so a day always has a single answer.
 */
export async function putMood(
  memberId: MemberId,
  day: DayKey,
  values: Pick<MoodEntry, 'hunger' | 'joy' | 'moody'>
    & Partial<Pick<MoodEntry, 'note' | 'rested' | 'grateful' | 'ateWell'>>,
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

/**
 * Every exercise entry in a range of days.
 *
 * Both members, when `memberId` is omitted. The week strip on Move wants one
 * person's own week; the calendar wants both, because it already shows both
 * partners' work events in one grid and a workout mark that only counted one
 * of them would be the odd thing out. The compound index cannot serve the
 * couple-wide case, so that one walks the bare `day` index instead.
 *
 * Whole entries rather than a summary, because the two callers want different
 * things out of them — which days to tint, and what the sets actually were —
 * and two reads of one table to answer one question about a month is how the
 * grid and its day sheet start disagreeing.
 */
export async function exercisesInRange(
  from: DayKey,
  to: DayKey,
  memberId?: MemberId,
): Promise<ExerciseEntry[]> {
  return memberId
    ? db.exercises
      .where('[memberId+day]')
      .between([memberId, from], [memberId, to], true, true)
      .toArray()
    : db.exercises.where('day').between(from, to, true, true).toArray();
}

/**
 * Which days in a range had a workout on them.
 *
 * "Had a workout" means **sets**, not merely a row. An entry can exist holding
 * nothing but a caption — `isWorthSaving` allows it, and a line about a rest
 * day is worth keeping — but a day with no sets is not a day somebody trained,
 * and marking it as one would make the week strip, the calendar and anything
 * counting a week disagree with each other. It is the same test `ExercisePage`
 * uses to decide whether the other phone is worth telling.
 *
 * One definition, in one place: the calendar derives its tint from
 * `trainedDays` over the same rows rather than asking the database a second
 * question with a second filter.
 */
export function trainedDays(rows: readonly ExerciseEntry[]): DayKey[] {
  // A set, deduplicated: with both members the same day arrives twice, and the
  // caller is asking which days were trained rather than how many rows exist.
  return [...new Set(rows.filter((r) => r.sets.length > 0).map((r) => r.day))].sort();
}

export async function workoutDays(
  from: DayKey,
  to: DayKey,
  memberId?: MemberId,
): Promise<DayKey[]> {
  return trainedDays(await exercisesInRange(from, to, memberId));
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
