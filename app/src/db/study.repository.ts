import { db } from './database';
import { addXp, ensureIdentity, getOrCreateAvatar } from './repository';
import { applyPayout, levelOf } from '../domain/rpg/avatar';
import type { DayKey } from '../domain/types';
import { newProgress, review } from '../domain/study/srs';
import { payoutForSession } from '../domain/study/payout';
import type { Card, CardProgress, Grade, StudySession } from '../domain/study/types';
import type { FinishInput, StudyReceipt, StudyStore } from './studyStore';

/**
 * Where the study layer meets storage, and the seam the rules get lost at.
 *
 * Two of them are pinned by the tests beside this file. A sitting is priced
 * against what the day has already paid for, not against nothing — otherwise
 * the daily cap is a suggestion. And the payout lands in the same transaction
 * as the session row, so a sitting that fails to save cannot still have moved
 * the pet.
 *
 * What is deliberately absent is the same thing that is absent from
 * `repository.ts`: there is no function here that subtracts. A card forgotten
 * is a card rescheduled.
 */

function id(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

export async function progressForDeck(deckId: string): Promise<Map<string, CardProgress>> {
  const rows = await db.studyProgress.where('deckId').equals(deckId).toArray();
  return new Map(rows.map((row) => [row.cardId, row]));
}

export async function progressAll(): Promise<Map<string, CardProgress>> {
  const rows = await db.studyProgress.toArray();
  return new Map(rows.map((row) => [row.cardId, row]));
}

/**
 * One graded card. Idempotent in the only sense that matters: grading the same
 * card twice in a sitting is two real reviews, and the second is priced from
 * the state the first left behind.
 */
export async function gradeCard(
  card: Pick<Card, 'id' | 'deckId'>,
  grade: Grade,
  day: DayKey,
): Promise<CardProgress> {
  return db.transaction('rw', db.studyProgress, async () => {
    const existing = await db.studyProgress.get(card.id);
    const before = existing ?? newProgress(card, day, now());
    const after = review(before, grade, day, now());
    await db.studyProgress.put(after);
    return after;
  });
}

export async function sessionsOn(day: DayKey): Promise<StudySession[]> {
  const rows = await db.studySessions.where('day').equals(day).toArray();
  return rows.sort((a, b) => a.finishedAt - b.finishedAt);
}

/** What today has already been paid for. The number the cap is measured from. */
export async function paidToday(day: DayKey): Promise<number> {
  const rows = await db.studySessions.where('day').equals(day).toArray();
  return rows.reduce((sum, row) => sum + row.paid, 0);
}

/**
 * Close a sitting.
 *
 * The whole thing is one transaction for the reason `completeTask` is: a payout
 * credited to a session that did not save is a payout that can be earned twice
 * by killing the tab at the right moment.
 */
export async function finishSession(input: FinishInput): Promise<StudyReceipt> {
  const { memberId, coupleId } = await ensureIdentity();

  return db.transaction('rw', db.studySessions, db.avatars, db.pet, async () => {
    const already = (await db.studySessions.where('day').equals(input.day).toArray())
      .reduce((sum, row) => sum + row.paid, 0);

    const { payout, paid } = payoutForSession(input.reviewed, already);

    const session: StudySession = {
      id: id(),
      deckId: input.deckId,
      day: input.day,
      mode: input.mode,
      reviewed: input.reviewed.length,
      correct: input.correct,
      paid,
      elapsedMs: input.elapsedMs,
      finishedAt: now(),
    };
    await db.studySessions.put(session);

    const before = await getOrCreateAvatar(memberId, coupleId);
    const after = applyPayout(before, payout, now());
    await db.avatars.put(after);

    // The pet levels from everything either of you does, and studying is one
    // of those things. Same call the Tasks page makes.
    await addXp(coupleId, payout.xp);

    return {
      payout,
      paid,
      levelBefore: levelOf(before),
      levelAfter: levelOf(after),
    };
  });
}

/** The in-app implementation of the seam in `studyStore.ts`. */
export const dexieStudyStore: StudyStore = {
  progressFor: progressForDeck,
  progressAll,
  grade: gradeCard,
  paidToday,
  finish: finishSession,
  sessionsOn,
};
