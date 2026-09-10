import { isoWeekOf } from '../day';
import type { DayKey } from '../types';
import type { TaskDifficulty } from './types';

/**
 * The plan a new install starts with: a couple should not open Tasks to an
 * empty list and a blank text field. Six small things every day, plus two
 * slots that change with the week so the list does not go stale for someone
 * who never edits it.
 *
 * These are seeded once as ordinary `Task` rows via `seedStarterPlan` in
 * `db/repository/rpg.ts` -- nothing here touches Dexie. After seeding, a
 * starter task is just a task: it can be renamed, retired, or left alone like
 * anything else on the list. The rotation only decides what gets planted.
 */
export interface StarterTask {
  title: string;
  difficulty: TaskDifficulty;
}

/**
 * The six that never change. All but one are `trivial` on purpose -- Finch's
 * own daily set leans the same way, because a list that is easy to finish
 * gets finished, and a list that does not get finished stops getting opened.
 */
export const STARTER_FIXED: readonly StarterTask[] = [
  { title: 'Brush your teeth', difficulty: 'trivial' },
  { title: 'Wash and brush your hair', difficulty: 'trivial' },
  { title: 'Drink water', difficulty: 'trivial' },
  { title: 'Do one thing that makes you happy', difficulty: 'easy' },
  { title: 'Take a stretch break', difficulty: 'trivial' },
  { title: 'Take three deep breaths', difficulty: 'trivial' },
];

/**
 * Where the two rotating slots draw from. Ordered so neighbours in the list
 * are never a near-duplicate of each other -- the pair is read off two
 * adjacent positions, so "drink water" sitting next to "have a glass of
 * water" would show up together every single week.
 */
export const STARTER_ROTATION_POOL: readonly StarterTask[] = [
  { title: 'Tidy one small thing', difficulty: 'easy' },
  { title: 'Step outside for a minute', difficulty: 'trivial' },
  { title: 'Text someone you like', difficulty: 'trivial' },
  { title: 'Eat something that is not from a wrapper', difficulty: 'easy' },
  { title: 'Write down one thing that went well', difficulty: 'trivial' },
  { title: 'Stand up and move for two minutes', difficulty: 'trivial' },
  { title: 'Put your phone down for ten minutes', difficulty: 'easy' },
  { title: 'Look at something far away for a moment', difficulty: 'trivial' },
  { title: 'Say one thing you are looking forward to', difficulty: 'trivial' },
  { title: 'Wash one dish before it becomes a pile', difficulty: 'easy' },
  { title: 'Open a window for some air', difficulty: 'trivial' },
  { title: 'Water something that is alive', difficulty: 'trivial' },
];

/**
 * The two rotating slots for a given ISO week, picked by arithmetic rather
 * than storage -- both phones land on the same pair with nothing synced,
 * because the week number is the only input and it agrees with itself.
 */
export function rotatingPairFor(isoWeek: number): readonly [StarterTask, StarterTask] {
  const n = STARTER_ROTATION_POOL.length;
  const i = ((isoWeek % n) + n) % n;
  const j = (i + 1) % n;
  return [STARTER_ROTATION_POOL[i], STARTER_ROTATION_POOL[j]];
}

/** The eight tasks a fresh install seeds for the week `day` falls in. */
export function starterPlanFor(day: DayKey): readonly StarterTask[] {
  return [...STARTER_FIXED, ...rotatingPairFor(isoWeekOf(day))];
}
