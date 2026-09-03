/**
 * Running a quest: what it becomes, and what it is worth when it does.
 *
 * Pure. The repository composes this with exactly one write, the way every
 * other domain module here is composed.
 *
 * The rule the whole file is arranged around: **a quest pays out once, on the
 * transition to complete.** `completedAt` is what records that the transition
 * has happened, and it is checked before anything is awarded — so progress
 * arriving after the target is reached, a page re-render, a second reconcile,
 * or a live query firing on this quest's own write all find a quest that has
 * already been paid and hand out nothing.
 */

import { addDays, daysBetween } from '../day';
import { questComplete, awardFor } from '../xp';
import type { DayKey, Quest, QuestDifficulty } from '../types';
import { QUEST_DIFFICULTIES, shapeFor, templateById, type QuestShape } from './templates';

/** A day a quest can still be worked on: from its start up to and including its end. */
export function coversDay(quest: Quest, day: DayKey): boolean {
  const from = quest.startedOn;
  const to = quest.endsOn;
  if (!from || !to) return true;
  return day >= from && day <= to;
}

/** Is this quest still the couple's live one? */
export function isActive(quest: Quest): boolean {
  return !quest.completedAt && !quest.retiredAt;
}

/**
 * Mint a quest.
 *
 * `endsOn` is inclusive and `expiresAt` is the instant after it, so "seven
 * days" means seven days of chances rather than six and a bit. The two are
 * stored rather than derived because `expiresAt` is the field the row has
 * always had and `endsOn` is the one a person is shown.
 */
export function newQuest(
  shape: QuestShape,
  coupleId: string,
  startedOn: DayKey,
  id: string,
  endOfDay: (day: DayKey) => number,
): Quest {
  const endsOn = addDays(startedOn, shape.days - 1);
  return {
    id,
    coupleId,
    templateId: shape.templateId,
    difficulty: shape.difficulty,
    title: shape.title,
    target: shape.target,
    progress: 0,
    xp: shape.xp,
    startedOn,
    endsOn,
    expiresAt: endOfDay(endsOn),
  };
}

/**
 * Move a quest's progress to a measured count.
 *
 * Set rather than incremented: progress is recomputed from the tables the
 * measure names, so the count is the truth and an increment that was missed —
 * a write that happened while the app was closed, a row that arrived by sync —
 * cannot leave the quest permanently behind.
 *
 * Clamped at the target so a stored quest never reads past its own bar, and
 * never below what it had: a deleted row must not walk a quest backwards.
 */
export function advance(quest: Quest, measured: number): Quest {
  const progress = Math.min(quest.target, Math.max(quest.progress, Math.trunc(measured)));
  return progress === quest.progress ? quest : { ...quest, progress };
}

/** What reckoning a quest decided. `award` is non-zero only on the transition. */
export type QuestStep =
  | { verb: 'running'; quest: Quest; award: 0 }
  | { verb: 'complete'; quest: Quest; award: number }
  | { verb: 'expired'; quest: Quest; award: 0 }
  | { verb: 'settled'; quest: Quest; award: 0 };

/**
 * Decide what a quest is now.
 *
 * Order matters. `settled` comes first: a quest that has already completed or
 * been retired is finished with, and asking any other question about it is how
 * a second payout happens. Completion comes before expiry, so a quest finished
 * on its last day is finished rather than expired.
 */
export function reckon(quest: Quest, today: DayKey): QuestStep {
  if (!isActive(quest)) return { verb: 'settled', quest, award: 0 };

  if (questComplete(quest)) {
    // `awardFor` is the arithmetic every other payout uses. Going through it
    // rather than reading `quest.xp` here means there is one definition of what
    // a finished quest is worth, not two that can drift.
    return { verb: 'complete', quest, award: awardFor([quest]) };
  }

  if (quest.endsOn && today > quest.endsOn) {
    return { verb: 'expired', quest, award: 0 };
  }

  return { verb: 'running', quest, award: 0 };
}

/**
 * Days left, counting today as one of them.
 *
 * A quest ending today has one day left, not none: `endsOn` is inclusive, and
 * telling someone they have no days left on a day they can still finish is
 * simply wrong. Never negative — a quest past its end is expired, and "minus
 * three days left" is not a thing to put on a screen.
 */
export function daysLeft(quest: Quest, today: DayKey): number | null {
  if (!quest.endsOn) return null;
  return Math.max(0, daysBetween(today, quest.endsOn) + 1);
}

/** Stamp a completed quest so it can never be paid again. */
export function markComplete(quest: Quest, at: number): Quest {
  return { ...quest, progress: Math.max(quest.progress, quest.target), completedAt: at };
}

/** Stamp a quest whose week ran out. Nothing is taken; it simply stops. */
export function markRetired(quest: Quest, at: number): Quest {
  return { ...quest, retiredAt: at };
}

/**
 * What the couple have been doing lately, to pick a first quest that is not a
 * stretch and not an insult.
 *
 * Each entry is a count of days in the recent window.
 */
export type RecentDays = Partial<Record<QuestShape['measure'], number>>;

/**
 * Order the shapes by what the couple already do.
 *
 * A quest suggested for something they have never touched is a quest they will
 * not take; one suggested for what they already do most is one they have half
 * finished before starting. Neither is much of an offer, so the ordering puts
 * the middle first: things with some history, most-practised last.
 */
export function seedFrom(
  shapes: readonly QuestShape[],
  recent: RecentDays,
  windowDays: number,
): QuestShape[] {
  const score = (shape: QuestShape) => {
    const done = recent[shape.measure] ?? 0;
    // Both sides on the quest's own timescale. `recent` is counted over a
    // longer window than a quest runs for, and comparing it to the target
    // directly made a fortnight's habit look like an unreachable one: something
    // done twice a week scored worse than something never done at all, and the
    // picker led with the measures the couple had never touched.
    const perQuest = windowDays > 0 ? done * (shape.days / windowDays) : done;
    // Distance from "already doing about half of it", which is the shape of a
    // quest worth taking and plausible to finish.
    return Math.abs(perQuest - shape.target / 2);
  };
  return [...shapes].sort((a, b) => score(a) - score(b) || a.templateId.localeCompare(b.templateId));
}

/**
 * How hard to offer, from how much they have been doing.
 *
 * Errs downward. A first quest that is finished early is an invitation to take
 * a harder one; a first quest that is not finished is the last one taken.
 */
export function suggestDifficulty(recent: RecentDays): QuestDifficulty {
  const busiest = Math.max(0, ...Object.values(recent).map((n) => n ?? 0));
  if (busiest >= 5) return 'hard';
  if (busiest >= 2) return 'steady';
  return 'easy';
}

/** The shape a stored quest was minted from, for a screen that wants its blurb. */
export function shapeOf(quest: Quest): QuestShape | undefined {
  const template = templateById(quest.templateId);
  return template ? shapeFor(template, quest.difficulty) : undefined;
}

/** Guard for a difficulty arriving from a select element or a stored row. */
export function isDifficulty(value: unknown): value is QuestDifficulty {
  return typeof value === 'string' && (QUEST_DIFFICULTIES as readonly string[]).includes(value);
}
