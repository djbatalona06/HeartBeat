import type { Payout } from '../domain/rpg/types';
import type { DayKey } from '../domain/types';
import type { Card, CardProgress, Grade, StudyMode, StudySession } from '../domain/study/types';

/**
 * The one seam that lets the study screen exist twice.
 *
 * Inside the app it is backed by Dexie, and finishing a sitting moves the
 * shared pet and your own avatar. In the standalone file there is no couple, no
 * pet and no IndexedDB, so it is backed by localStorage and keeps its own small
 * tally instead. The screen cannot tell which it has, because it is handed one
 * of these and never imports `db`.
 *
 * Everything here is async even where localStorage is not, so the two
 * implementations have the same shape and the screen has one code path.
 */

export interface FinishInput {
  deckId: string;
  day: DayKey;
  mode: StudyMode;
  /** The cards actually seen, in the order they were seen. */
  reviewed: Array<Pick<Card, 'id' | 'difficulty'>>;
  correct: number;
  elapsedMs: number;
}

export interface StudyReceipt {
  payout: Payout;
  /** How many cards the daily cap allowed this sitting to be paid for. */
  paid: number;
  levelBefore: number;
  levelAfter: number;
}

export interface StudyStore {
  /** Progress for one deck, keyed by card id. */
  progressFor(deckId: string): Promise<Map<string, CardProgress>>;
  /** Progress for everything, for the counts on the picker and the tile. */
  progressAll(): Promise<Map<string, CardProgress>>;
  /** Record one press of one of the four buttons. */
  grade(card: Pick<Card, 'id' | 'deckId'>, grade: Grade, day: DayKey): Promise<CardProgress>;
  /** Cards already paid for today, across every deck and both modes. */
  paidToday(day: DayKey): Promise<number>;
  /** Close the sitting and pay for it. */
  finish(input: FinishInput): Promise<StudyReceipt>;
  /** Today's sittings, newest last. Shown as the day's record. */
  sessionsOn(day: DayKey): Promise<StudySession[]>;
}
