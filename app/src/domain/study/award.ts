/**
 * What a finished study session is worth to the couple's pet.
 *
 * Jenny's study app and this one are separate PWAs on separate origins with
 * separate storage. What connects them is one call: when she finishes a deck or
 * a quiz there, the pet here gains XP. Nothing else crosses.
 *
 * Everything in this file is pure, and it holds the three decisions that are
 * easy to get quietly wrong:
 *
 *  - **What each kind is worth.** The study app already knows a deck from a
 *    single card, and flattening that would make finishing one card worth as
 *    much as finishing a session.
 *  - **How an award is named.** Both phones sync the pet, and the ledger
 *    deduplicates on the award id, so the id has to be derived from the session
 *    rather than from the moment it arrived — a retried request must collide
 *    with its first attempt, not add a second gain.
 *  - **Which day it counts as.** The study app dates its streak in UTC and its
 *    wallet in local time. This app's rule is the member's own timezone, and
 *    the daily ceiling has to agree with the person's idea of a day or it will
 *    cut off mid-evening.
 */

/** The completions the study app can report. Anything else is refused. */
export const STUDY_KINDS = ['deck', 'quiz', 'match', 'anatomy', 'weekly'] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];

/**
 * XP per completion, in the same units the RPG layer uses.
 *
 * Small on purpose: a study session should nudge the pet along, not overtake
 * everything the couple does together. A quest is worth more than any of these.
 */
export const STUDY_XP: Record<StudyKind, number> = {
  deck: 20,
  quiz: 25,
  weekly: 35,
  match: 10,
  anatomy: 15,
};

/**
 * The most one day of studying can add.
 *
 * Not a punishment — it is what stops a loop in the study app, or someone
 * replaying the same request with fresh ids, quietly inflating a shared pet
 * that both people are supposed to have earned together.
 */
export const STUDY_DAILY_CAP = 120;

export function isStudyKind(value: unknown): value is StudyKind {
  return typeof value === 'string' && (STUDY_KINDS as readonly string[]).includes(value);
}

export function xpFor(kind: StudyKind): number {
  return STUDY_XP[kind];
}

/**
 * The award id for one session.
 *
 * Derived from the session's own id, which the study app mints once and keeps
 * in its offline queue until the send succeeds. That is what makes a retry
 * idempotent: the same session produces the same id however many times it is
 * sent, and `INSERT OR IGNORE` on the ledger's primary key does the rest.
 *
 * Prefixed so it can never collide with a quest or achievement award, which are
 * named `quest-<id>` and `ach-<code>`.
 */
export function studyAwardId(sessionId: string): string {
  return `study-${sessionId}`;
}

/** A session id has to be safe in a primary key and short enough to store. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isUsableSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

/**
 * The day an instant falls on, in the member's own timezone.
 *
 * `en-CA` because it formats as YYYY-MM-DD, which is the shape every day key in
 * this app already uses. An unknown zone throws in `Intl`, so it falls back to
 * UTC rather than taking the request down — a cap computed in the wrong zone is
 * a worse day boundary, not a broken feature.
 */
export function studyDayKey(at: number, timeZone: string): string {
  try {
    return new Date(at).toLocaleDateString('en-CA', { timeZone });
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

/**
 * How much of a proposed gain the daily ceiling actually allows.
 *
 * Returns the clamped amount rather than refusing outright: a session that
 * lands on the cap should still count for what is left, and the study app
 * should not have to know the ceiling exists.
 */
export function allowedGain(alreadyToday: number, wanted: number): number {
  return Math.max(0, Math.min(wanted, STUDY_DAILY_CAP - alreadyToday));
}
