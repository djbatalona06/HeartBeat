import { addDays, daysBetween } from '../day';
import type { DayKey } from '../types';
import {
  DIFFICULTY_WEIGHT,
  type Payout,
  type Task,
  type TaskDifficulty,
  type TaskType,
} from './types';

/**
 * Task value drift — the one Habitica mechanic that survives intact, because it
 * is a reward gradient rather than a punishment. A task done every day for a
 * month pays less; one you have been avoiding pays more the day you come back
 * to it. A pull toward the hard thing, in Habitica's own mechanic.
 */

/**
 * Habitica clamps value near ±22. That was tried here first and rejected: at
 * ±22 the multiplier spread is 0.9747^-22 / 0.9747^22 ≈ 3.1, so a neglected
 * task pays three times a well-worn one, which stops being a nudge and becomes
 * an instruction to game the list. ±11 gives ≈1.76 — felt, not obeyed.
 */
export const VALUE_CLAMP = 11;

/** Habitica's own decay base. One completion is worth 0.9747× the last. */
export const VALUE_DECAY = 0.9747;

/**
 * How far one completion moves the value. Chosen so roughly three weeks of
 * daily completions walks a task from neutral to well-worn, rather than the
 * four days a difficulty-scaled step would take against the tighter clamp.
 */
export const VALUE_STEP = 0.5;

export function clampValue(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(-VALUE_CLAMP, Math.min(VALUE_CLAMP, value));
}

/**
 * The reward gradient itself. Below zero the task has been waiting and pays
 * above par; above zero it is well-worn and pays below.
 */
export function valueMultiplier(value: number): number {
  return VALUE_DECAY ** clampValue(value);
}

const BASE_XP = 6;
const BASE_COINS = 3;
const BASE_ENERGY = 4;
const BASE_MP = 2;

/** Every completion pays something. Finch's manner: showing up counts. */
function atLeastOne(n: number): number {
  return Math.max(1, Math.round(n));
}

/**
 * XP and coins ride the value curve; energy and MP do not.
 *
 * Habitica's economy is meant to be value-sensitive, and XP and coins are that
 * economy. Finch's energy is meant to be *plannable*: if an adventure costs 25
 * and a task pays somewhere between 4 and 9 depending on how long you have been
 * ignoring it, you cannot tell whether tonight's list gets the pet out the door
 * — and that uncertainty is exactly the anxious feeling this half of the design
 * exists to avoid. So energy and MP depend only on difficulty, which you can
 * read off the task before you start it.
 */
export function payoutFor(task: Pick<Task, 'difficulty' | 'value'>): Payout {
  const weight = DIFFICULTY_WEIGHT[task.difficulty];
  const multiplier = valueMultiplier(task.value);
  return {
    xp: atLeastOne(BASE_XP * weight * multiplier),
    coins: atLeastOne(BASE_COINS * weight * multiplier),
    energy: atLeastOne(BASE_ENERGY * weight),
    mp: atLeastOne(BASE_MP * weight),
  };
}

export interface CompletionResult {
  /** What the completion paid, priced from the value it had before. */
  payout: Payout;
  value: number;
  streak: number;
  lastCompletedOn: DayKey;
  /** A to-do is finished rather than reset, so it carries `done`. */
  done: boolean;
}

export function complete(task: Task, day: DayKey): CompletionResult {
  const payout = payoutFor(task);
  const drift = VALUE_STEP * valueMultiplier(task.value);
  return {
    payout,
    value: clampValue(task.value + drift),
    streak: task.streak + 1,
    lastCompletedOn: day,
    done: task.type === 'todo',
  };
}

/**
 * A day the task was due and was not done.
 *
 * The return shape is the ruling made structural: `{ value, streak }` and
 * nothing else. There is no field here for a cost, so no future edit can
 * quietly add one without changing this signature and the test that pins it.
 * The task simply becomes worth more the next time it is picked up.
 */
export function neglect(task: Task): { value: number; streak: number } {
  const drift = VALUE_STEP * valueMultiplier(task.value);
  return { value: clampValue(task.value - drift), streak: 0 };
}

/**
 * The minus side of a Habit. In Habitica this costs health; here it only moves
 * the value, which makes the plus side worth more the next time. The slip is
 * recorded, and recording it is the whole of it.
 */
export function pressDown(task: Task): { value: number; streak: number } {
  return neglect(task);
}

/** How a task is spoken about. Finch's register: never a scolding. */
export type TaskTone = 'waiting' | 'drifting' | 'steady' | 'warm' | 'well-worn';

export function toneFor(value: number): TaskTone {
  const v = clampValue(value);
  if (v <= -7) return 'waiting';
  if (v <= -2) return 'drifting';
  if (v < 2) return 'steady';
  if (v < 7) return 'warm';
  return 'well-worn';
}

export const TONE_LINES: Record<TaskTone, string> = {
  waiting: 'This one has been waiting. Today it is worth the most.',
  drifting: 'It has been a little while — worth more than usual.',
  steady: 'Right about where it should be.',
  warm: 'You have been keeping this one up.',
  'well-worn': 'Well-worn, so it pays a little less. That is the good outcome.',
};

export function toneLine(value: number): string {
  return TONE_LINES[toneFor(value)];
}

/** 0 = Sunday, matching `Date#getDay`. */
export function weekdayOf(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Only Dailies are ever "due". Habits are always available and To-Dos have no
 * schedule, so asking whether either is due is a category error that returns
 * false rather than throwing.
 */
export function isDue(task: Pick<Task, 'type' | 'dueDays'>, day: DayKey): boolean {
  if (task.type !== 'daily') return false;
  if (!task.dueDays || task.dueDays.length === 0) return true;
  return task.dueDays.includes(weekdayOf(day));
}

export function isCompletedOn(task: Pick<Task, 'lastCompletedOn'>, day: DayKey): boolean {
  return task.lastCompletedOn === day;
}

/** What is left to do today, in the order a list should show it. */
export function openDailies(tasks: Task[], day: DayKey): Task[] {
  return tasks
    .filter((t) => !t.archivedAt && isDue(t, day) && !isCompletedOn(t, day))
    .sort((a, b) => a.value - b.value);
}

/**
 * How far back a settle will ever walk. A phone left closed for a season should
 * come back to a task that has been waiting, not to three months of arithmetic.
 */
export const MAX_SETTLE_DAYS = 30;

/**
 * Judge the days between the last settle and `throughDay` — which is yesterday,
 * never today, because today has not been missed yet.
 *
 * Idempotent by construction: the window starts the day after `lastSettledOn`,
 * so opening the app twice in one evening cannot count the same missed day
 * twice. Nothing here can take anything away; the only outcome of a missed day
 * is that the task becomes worth more.
 */
export function settleMissed(
  task: Task,
  throughDay: DayKey,
  maxDays: number = MAX_SETTLE_DAYS,
): { value: number; streak: number; lastSettledOn: DayKey; missed: number } {
  const unchanged = { value: task.value, streak: task.streak, lastSettledOn: throughDay, missed: 0 };
  if (task.type !== 'daily' || task.archivedAt) return unchanged;

  const anchor = task.lastSettledOn ?? task.lastCompletedOn;
  if (!anchor) return unchanged;

  // A completion settles its own day, so never re-judge one already claimed.
  let from = addDays(anchor, 1);
  if (task.lastCompletedOn && daysBetween(task.lastCompletedOn, from) <= 0) {
    from = addDays(task.lastCompletedOn, 1);
  }
  const span = daysBetween(from, throughDay);
  if (span < 0) return unchanged;
  if (span >= maxDays) from = addDays(throughDay, -(maxDays - 1));

  let { value, streak } = task;
  let missed = 0;
  for (let day = from; daysBetween(day, throughDay) >= 0; day = addDays(day, 1)) {
    if (!isDue(task, day)) continue;
    const result = neglect({ ...task, value, streak });
    value = result.value;
    streak = result.streak;
    missed += 1;
  }
  return { value, streak, lastSettledOn: throughDay, missed };
}

export function newTask(
  fields: {
    id: string;
    coupleId: string;
    memberId: string;
    type: TaskType;
    title: string;
    difficulty?: TaskDifficulty;
    notes?: string;
    dueDays?: number[];
  },
  at: number,
  day: DayKey,
): Task {
  return {
    id: fields.id,
    coupleId: fields.coupleId,
    memberId: fields.memberId,
    type: fields.type,
    title: fields.title,
    notes: fields.notes,
    difficulty: fields.difficulty ?? 'easy',
    value: 0,
    streak: 0,
    dueDays: fields.dueDays,
    // Settled from birth, so a task created today is never judged for the days
    // before it existed.
    lastSettledOn: day,
    createdAt: at,
    updatedAt: at,
  };
}
