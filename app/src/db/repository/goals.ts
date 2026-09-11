import { db } from '../database';
import type { DayKey, MemberId } from '../../domain/types';
import { SCHEDULED_TYPES, type AreaId, type Task, type TaskDifficulty } from '../../domain/rpg/types';
import { suggestionById, tailoredFor, type Suggestion } from '../../domain/rpg/selfCare';
import { putTask } from './rpg';
import { now } from './shared';

/* -- goals ------------------------------------------------------------------ */

/**
 * Goals are `Task` rows of type `goal`, not a table of their own.
 *
 * That is the whole design decision, and it buys three things that would
 * otherwise have to be written again: the value curve that makes a neglected
 * goal worth more when you come back to it, the settle walk that drifts one you
 * missed, and the "already ticked today pays nothing" guard in `completeTask`
 * that is the only thing standing between the economy and a goal you can tap
 * sixty times. A goals table would have needed its own copy of all three, and
 * the copies would have been the ones with the bugs.
 *
 * So nothing here completes or prices a goal. Completion is `completeTask`, the
 * same call Home and Tasks already make. What lives here is only what is
 * specific to goals: adopting one out of the catalogue, re-filing it, and
 * reading them back grouped by area.
 */

/** Every goal a person has, including archived ones — callers filter. */
export async function goalsFor(memberId: MemberId): Promise<Task[]> {
  return db.tasks.where('[memberId+type]').equals([memberId, 'goal']).toArray();
}

/**
 * Everything scheduled, which is what the ideas screen has to look at.
 *
 * Not just goals: the starter plan seeds its eight as dailies carrying the same
 * `suggestionId`, so an ideas screen that only read goals would cheerfully
 * offer you "brush your teeth" on a fresh install, next to the copy of it the
 * app planted ten seconds earlier.
 */
export async function adoptedFor(memberId: MemberId): Promise<Task[]> {
  return (await Promise.all(
    SCHEDULED_TYPES.map((type) => db.tasks.where('[memberId+type]').equals([memberId, type]).toArray()),
  )).flat();
}

/** Goals grouped by area, archived ones dropped, in catalogue area order. */
export function groupByArea(goals: Task[]): Map<AreaId | 'unfiled', Task[]> {
  const out = new Map<AreaId | 'unfiled', Task[]>();
  for (const goal of goals) {
    if (goal.archivedAt) continue;
    const key = goal.area ?? 'unfiled';
    const bucket = out.get(key);
    if (bucket) bucket.push(goal);
    else out.set(key, [goal]);
  }
  return out;
}

/**
 * Take a suggestion and make it yours.
 *
 * Idempotent on the suggestion id rather than guarded by the caller: the ideas
 * screen hides what you already took, but a double-tap on a slow phone should
 * not plant the same goal twice, and the check has to happen inside the same
 * transaction as the write or it is only a narrower race. Returns the existing
 * id when there already is one, so the caller cannot tell the difference and
 * does not have to care.
 */
export async function adoptSuggestion(
  memberId: MemberId,
  coupleId: string,
  suggestionId: string,
  day: DayKey,
): Promise<string | null> {
  const suggestion = suggestionById(suggestionId);
  if (!suggestion) return null;

  return db.transaction('rw', db.tasks, async () => {
    const mine = await db.tasks.where('[memberId+type]').equals([memberId, 'goal']).toArray();
    const already = mine.find((t) => t.suggestionId === suggestionId && !t.archivedAt);
    if (already) return already.id;

    return putTask(
      {
        coupleId,
        memberId,
        type: 'goal',
        title: suggestion.title,
        difficulty: suggestion.difficulty,
        area: suggestion.area,
        suggestionId: suggestion.id,
      },
      day,
    );
  });
}

/** A goal somebody wrote themselves. Area is required — that is the point of it. */
export async function addGoal(
  fields: {
    memberId: MemberId;
    coupleId: string;
    title: string;
    area: AreaId;
    difficulty?: TaskDifficulty;
    notes?: string;
    dueDays?: number[];
  },
  day: DayKey,
): Promise<string> {
  return putTask({ ...fields, type: 'goal', difficulty: fields.difficulty ?? 'easy' }, day);
}

/** Move a goal to a different area, leaving its streak and value alone. */
export async function refileGoal(taskId: string, area: AreaId): Promise<void> {
  const task = await db.tasks.get(taskId);
  if (!task || task.type !== 'goal') return;
  await db.tasks.put({ ...task, area, updatedAt: now() });
}

/** What to offer, given the areas chosen and everything already adopted. */
export async function ideasFor(memberId: MemberId, areas: AreaId[]): Promise<Suggestion[]> {
  return tailoredFor(areas, await adoptedFor(memberId));
}
