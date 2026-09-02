/**
 * What is earned, given what has happened.
 *
 * Pure, and deliberately so: this decides, `repository.ts` writes, and the
 * shelf renders. Keeping the decision here is what makes it testable in a
 * `node` environment with no Dexie, and what lets the writer re-run it inside
 * its own transaction rather than trusting an argument that may be stale.
 */

import {
  ACHIEVEMENTS,
  NO_PROGRESS_KEYS,
  payoutOf,
  type AchievementDef,
  type AchievementState,
} from './catalogue';

/**
 * The zero state: a couple who have just paired and done nothing yet. Built
 * from the key list so a new measure starts at zero rather than `undefined`,
 * which would compare false against every rung and hide the whole track.
 */
export const NO_PROGRESS: AchievementState = Object.fromEntries(
  NO_PROGRESS_KEYS.map((key) => [key, 0]),
) as AchievementState;

/**
 * The rows the counters are read from.
 *
 * Spelled out structurally rather than importing the Dexie row types, so this
 * module stays honest about needing only these fields — and so a test can
 * build a state without constructing a whole `Task`.
 */
export interface ProgressInput {
  moodDays?: number;
  exerciseDays?: number;
  proofDays?: number;
  tasks?: ReadonlyArray<{ streak?: number; lastCompletedOn?: string }>;
  events?: number;
  cycleDays?: number;
  notes?: number;
  vibesSent?: number;
  pets?: number;
  gear?: Readonly<Record<string, string | undefined>>;
  petLevel?: number;
}

/**
 * Build the counters.
 *
 * `tasksFinished` counts distinct tasks that carry a completion date, archived
 * ones included — `archiveTask` marks rather than deletes, so a finished to-do
 * is still there to be counted. It is deliberately not a count of completions:
 * nothing durable records those, a daily's completion resets, and inventing a
 * lifetime counter would be a schema change this unit has no business making.
 * A daily held for a year counts once here, which is what `bestStreak` is for.
 *
 * `bestStreak` is the high-water mark across tasks, not a sum — "ten in a row"
 * should mean ten in a row on one thing, not ten completions spread about.
 */
export function stateFrom(input: ProgressInput): AchievementState {
  const tasks = input.tasks ?? [];
  return {
    moodDays: input.moodDays ?? 0,
    exerciseDays: input.exerciseDays ?? 0,
    proofDays: input.proofDays ?? 0,
    tasksFinished: tasks.filter((t) => Boolean(t.lastCompletedOn)).length,
    bestStreak: tasks.reduce((max, t) => Math.max(max, t.streak ?? 0), 0),
    events: input.events ?? 0,
    cycleDays: input.cycleDays ?? 0,
    notes: input.notes ?? 0,
    vibesSent: input.vibesSent ?? 0,
    pets: input.pets ?? 0,
    gearWorn: countGear(input.gear),
    petLevel: input.petLevel ?? 0,
  };
}

/** Slots actually filled. An absent slot is unequipped; so is an empty string. */
export function countGear(gear: Readonly<Record<string, string | undefined>> | undefined): number {
  if (!gear) return 0;
  return Object.values(gear).filter((id) => typeof id === 'string' && id.length > 0).length;
}

/** Has this rung been reached? */
export function isEarned(def: AchievementDef, state: AchievementState): boolean {
  return state[def.measure] >= def.need;
}

/** Every code the state has earned, in catalogue order. */
export function unlock(state: AchievementState): string[] {
  return ACHIEVEMENTS.filter((def) => isEarned(def, state)).map((def) => def.code);
}

/**
 * What is earned but not yet recorded.
 *
 * The whole reason a separate function exists: the caller must be able to ask
 * "what is new" without re-deriving it from a list of everything, because
 * paying out for everything on every evaluation is the bug this shape prevents.
 */
export function newlyEarned(
  state: AchievementState,
  already: Iterable<string>,
): AchievementDef[] {
  const have = new Set(already);
  return ACHIEVEMENTS.filter((def) => !have.has(def.code) && isEarned(def, state));
}

/** What a claim of these definitions is worth, all together. */
export function payoutFor(defs: readonly AchievementDef[]): number {
  return defs.reduce((sum, def) => sum + payoutOf(def), 0);
}

export interface Progress {
  def: AchievementDef;
  have: number;
  need: number;
  /** Clamped to 1 so a finished rung does not render past the end of its bar. */
  fraction: number;
  earned: boolean;
}

export function progressOf(def: AchievementDef, state: AchievementState): Progress {
  const have = state[def.measure];
  const fraction = def.need <= 0 ? 1 : Math.min(1, have / def.need);
  return { def, have, need: def.need, fraction, earned: have >= def.need };
}

/**
 * The next rung on each track, so the shelf can show one thing per row rather
 * than three. A track whose rungs are all earned returns its last, which is
 * what lets it render as finished rather than disappearing.
 */
export function nextUp(state: AchievementState): Progress[] {
  const out: Progress[] = [];
  for (const def of ACHIEVEMENTS) {
    const existing = out.findIndex((p) => p.def.track === def.track);
    const progress = progressOf(def, state);
    if (existing === -1) {
      out.push(progress);
      continue;
    }
    // Replace only while the one already there is finished: the first unearned
    // rung is the one to show, and everything past it stays hidden.
    if (out[existing].earned) out[existing] = progress;
  }
  return out;
}

/**
 * How many untouched tracks the shelf offers alongside the ones under way.
 *
 * Small on purpose. Every track shown at once means a couple who have just
 * paired open the page to a dozen empty bars, which is a chore list wearing an
 * achievement's clothes — the wall of locked doors `docs/DESIGN.md` says to
 * take the calm of and not the clutter. A few suggestions read as an invitation;
 * twelve read as a backlog.
 */
export const SUGGESTIONS = 3;

/**
 * What the shelf actually shows.
 *
 * Everything already under way, in catalogue order, and then a few things that
 * have not been started. The list therefore grows as the couple do more, rather
 * than starting full and slowly turning green — which is the same information
 * told the other way round, and the other way round is discouraging.
 */
export function shelfRows(state: AchievementState, suggestions: number = SUGGESTIONS): Progress[] {
  const rows = nextUp(state);
  const moving = rows.filter((r) => r.have > 0);
  const untouched = rows.filter((r) => r.have === 0);
  return [...moving, ...untouched.slice(0, Math.max(0, suggestions))];
}

