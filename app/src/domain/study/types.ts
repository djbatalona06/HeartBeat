import type { DayKey } from '../types';
import type { TaskDifficulty } from '../rpg/types';

/**
 * The study layer: spaced repetition, wearing the same manner as the rest of
 * the app.
 *
 * The ruling in `rpg/types.ts` — that health exists only inside a boss fight,
 * and daily life can never take anything away — applies here too, and the
 * shapes in this file are what enforce it. A forgotten card has no cost field
 * to charge; the only thing forgetting does is bring the card back sooner. So
 * `Grade` is a scheduling signal and nothing else, and no type below carries a
 * penalty for getting one wrong.
 *
 * Difficulty is `TaskDifficulty`, deliberately reused rather than redeclared:
 * a hard card should be worth what a hard task is worth, and one shared scale
 * is the only way that stays true when either side is tuned.
 */

/**
 * How well a card came back. SM-2's six-point quality scale is collapsed to
 * four, because the two it loses are the two nobody can tell apart in the
 * moment — the difference between "blank" and "wrong" is not a judgement
 * anyone makes honestly at eleven at night.
 */
export type Grade = 'again' | 'hard' | 'good' | 'easy';

export const GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];

export interface Card {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  /**
   * Why it is the answer. Required, not optional: a flashcard that only asserts
   * teaches recall of a string, and the point is to learn the thing.
   */
  why: string;
  difficulty: TaskDifficulty;
}

export interface Deck {
  id: string;
  title: string;
  /** One line, shown on the picker. */
  blurb: string;
  cards: Card[];
}

/**
 * What is known about one card for one person. Cards themselves are static and
 * ship with the build; this is the only part that is written, which is why the
 * two are separate types and separate stores.
 */
export interface CardProgress {
  cardId: string;
  deckId: string;
  /** SM-2's ease factor, clamped by `srs.ts`. */
  ease: number;
  /** Days from the last review to the next. Zero means "again, today". */
  interval: number;
  /** Consecutive reviews graded `hard` or better. Reset by `again`. */
  streak: number;
  dueOn: DayKey;
  lastReviewedOn?: DayKey;
  reviews: number;
  /** Times a card that was already known came back blank. A count, never a cost. */
  lapses: number;
  updatedAt: number;
}

export type StudyMode = 'review' | 'quiz';

/**
 * One sitting. Written once, when it ends, and never edited — which is what
 * makes `day` safe to use as the guard against a second session on the same day
 * being paid twice.
 */
export interface StudySession {
  id: string;
  deckId: string;
  day: DayKey;
  mode: StudyMode;
  /** Cards seen. The number the payout is priced from. */
  reviewed: number;
  /** Graded `good` or `easy`. Reported, but deliberately not a multiplier. */
  correct: number;
  /**
   * How many of those cards were actually paid for, after the daily cap in
   * `payout.ts`. Stored rather than recomputed because it is what the *next*
   * sitting of the day prices itself against, and a cap that can be recomputed
   * differently later is a cap that can be walked around.
   */
  paid: number;
  elapsedMs: number;
  finishedAt: number;
}
