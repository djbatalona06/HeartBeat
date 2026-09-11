import { isoWeekOf } from '../day';
import type { DayKey } from '../types';
import { suggestionById, type Suggestion } from './selfCare';

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
 *
 * What this file no longer holds is the *wording*. It used to carry eighteen
 * title literals of its own, which by the time Goals arrived were a second
 * catalogue saying nearly the same things as `selfCare.ts` in slightly
 * different words. It now names ids out of that one catalogue instead, so a
 * seeded task and the suggestion it came from cannot drift apart -- and so the
 * ideas screen knows not to offer you something the app already planted.
 */
export type StarterTask = Suggestion;

/**
 * Resolve a catalogue id, loudly.
 *
 * A typo here would otherwise seed a shorter plan in silence -- five dailies
 * instead of six, on a brand-new install, with nothing in any log to say why.
 * Throwing at module load means the test suite cannot start, which is the
 * cheapest possible place to find out. Same reasoning as the gear art registry
 * in `features/party/art/gear/index.ts`.
 */
function pick(ids: readonly string[]): readonly Suggestion[] {
  return ids.map((id) => {
    const found = suggestionById(id);
    if (!found) throw new Error(`starter plan names a suggestion that does not exist: ${id}`);
    return found;
  });
}

/**
 * The six that never change. All but one are `trivial` on purpose -- Finch's
 * own daily set leans the same way, because a list that is easy to finish
 * gets finished, and a list that does not get finished stops getting opened.
 */
export const STARTER_FIXED: readonly StarterTask[] = pick([
  'body-teeth',
  'body-hair',
  'body-water',
  'feel-happy-thing',
  'body-stretch',
  'mind-breaths',
]);

/**
 * Where the two rotating slots draw from. Ordered so neighbours in the list
 * are never a near-duplicate of each other -- the pair is read off two
 * adjacent positions, so "drink water" sitting next to "have a glass of
 * water" would show up together every single week. The ordering is the reason
 * this is an explicit id list rather than a filter over the catalogue.
 */
export const STARTER_ROTATION_POOL: readonly StarterTask[] = pick([
  'space-tidy-one',
  'space-outside',
  'people-text',
  'body-real-food',
  'feel-went-well',
  'body-move-two',
  'mind-phone-down',
  'body-far',
  'purpose-looking-forward',
  'space-dish',
  'space-window',
  'space-plant',
]);

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
