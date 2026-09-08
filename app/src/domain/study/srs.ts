import { addDays, daysBetween } from '../day';
import type { DayKey } from '../types';
import type { Card, CardProgress, Grade } from './types';

/**
 * The scheduler. SM-2, with the punishment taken out.
 *
 * SM-2 is a good algorithm wearing a bad manner: it speaks in "quality of
 * recall" out of six, and its canonical implementations reset a lapsed card to
 * the very beginning as though the twenty reviews before it had not happened.
 * What survives here is the arithmetic — an ease factor that drifts with how
 * hard a card keeps being, and intervals that multiply by it. What is changed
 * is the failure branch: `again` brings a card back today and dents its ease,
 * and that is the whole of it. Nothing is taken away, because the ruling in
 * `rpg/types.ts` says daily life never takes anything away, and forgetting a
 * fact is about as daily as life gets.
 */

/** SM-2's own starting ease. */
export const EASE_START = 2.5;

/**
 * SM-2 floors ease at 1.3 and lets it rise without limit. The floor is kept —
 * below it intervals stop growing and a card is in a loop rather than a
 * schedule. The ceiling is added: unbounded ease sends a card you happened to
 * guess right three times into a year-long interval, and the whole value of
 * this is that it brings things back before they are gone.
 */
export const EASE_FLOOR = 1.3;
export const EASE_CEILING = 3;

/**
 * Four grades onto SM-2's six-point scale.
 *
 * `again` sits at 2 rather than 0 because 0 costs 0.8 of ease in a single
 * press — two-thirds of the whole span between the floor and the start, gone
 * for one blank. At 2 it costs 0.32, which is a dent rather than a demolition:
 * one bad night does not undo a month of a card being easy.
 */
const QUALITY: Record<Grade, number> = { again: 2, hard: 3, good: 4, easy: 5 };

export function clampEase(ease: number): number {
  if (Number.isNaN(ease)) return EASE_START;
  return Math.max(EASE_FLOOR, Math.min(EASE_CEILING, ease));
}

/** SM-2's ease update, verbatim, then clamped. */
export function adjustEase(ease: number, grade: Grade): number {
  const q = QUALITY[grade];
  return clampEase(ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
}

export const FIRST_INTERVAL = 1;
export const SECOND_INTERVAL = 6;

/**
 * A year. Past this the schedule is not doing anything a bookmark could not do,
 * and a card you will next see in 2029 may as well be one you have retired.
 */
export const MAX_INTERVAL = 365;

/** `hard` still moves forward, just barely. Standing still is what `again` is for. */
export const HARD_FACTOR = 1.2;
export const EASY_BONUS = 1.3;

/**
 * Days until this card should come back.
 *
 * The two fixed early steps are SM-2's and are the part worth keeping literally:
 * a card seen once is worth seeing tomorrow whatever you thought of it, and one
 * that survived tomorrow is worth a week. Only after that does ease take over.
 */
export function nextInterval(
  progress: Pick<CardProgress, 'interval' | 'streak'>,
  grade: Grade,
  ease: number,
): number {
  if (grade === 'again') return 0;
  if (progress.streak === 0) return grade === 'easy' ? SECOND_INTERVAL : FIRST_INTERVAL;
  if (progress.streak === 1) return grade === 'hard' ? FIRST_INTERVAL * 2 : SECOND_INTERVAL;

  const factor = grade === 'hard' ? HARD_FACTOR : ease;
  // At least one day further than last time: rounding a short interval by a
  // floored ease can otherwise return the same number twice and stall the card.
  const grown = Math.max(progress.interval + 1, Math.round(progress.interval * factor));
  const withBonus = grade === 'easy' ? Math.round(grown * EASY_BONUS) : grown;
  return Math.min(MAX_INTERVAL, withBonus);
}

/** A card nobody has graded yet. Due the day it is introduced. */
export function newProgress(
  card: Pick<Card, 'id' | 'deckId'>,
  day: DayKey,
  at: number,
): CardProgress {
  return {
    cardId: card.id,
    deckId: card.deckId,
    ease: EASE_START,
    interval: 0,
    streak: 0,
    dueOn: day,
    reviews: 0,
    lapses: 0,
    updatedAt: at,
  };
}

/**
 * One press of one of the four buttons.
 *
 * Pure, and total: every grade returns a whole `CardProgress`, so there is no
 * branch in which a review half-lands. A lapse is counted only for a card that
 * had been answered before — the first time you meet a fact and do not know it
 * is not forgetting, it is Tuesday.
 */
export function review(
  progress: CardProgress,
  grade: Grade,
  day: DayKey,
  at: number,
): CardProgress {
  const ease = adjustEase(progress.ease, grade);
  const interval = nextInterval(progress, grade, ease);
  const lapsed = grade === 'again' && progress.reviews > 0;
  return {
    ...progress,
    ease,
    interval,
    streak: grade === 'again' ? 0 : progress.streak + 1,
    dueOn: addDays(day, interval),
    lastReviewedOn: day,
    reviews: progress.reviews + 1,
    lapses: progress.lapses + (lapsed ? 1 : 0),
    updatedAt: at,
  };
}

/** Due today, or overdue. A card scheduled for tomorrow is not offered early. */
export function isDue(progress: Pick<CardProgress, 'dueOn'>, day: DayKey): boolean {
  return daysBetween(progress.dueOn, day) >= 0;
}

/** How many days late. Negative for a card not yet due; used only for ordering. */
export function overdueBy(progress: Pick<CardProgress, 'dueOn'>, day: DayKey): number {
  return daysBetween(progress.dueOn, day);
}
