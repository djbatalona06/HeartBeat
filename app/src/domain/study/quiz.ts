import type { Card, Deck } from './types';

/**
 * Quiz mode: the same cards, asked against a clock, with three wrong answers
 * beside the right one.
 *
 * It exists because recall and recognition are different skills, and the second
 * is the one an interview actually tests. It is scored, the score is shown, and
 * the score buys nothing — the payout in `payout.ts` prices cards seen, not
 * questions got right. A number worth beating and worth nothing is the only
 * kind that can be put in front of someone learning a hard thing.
 */

export const QUIZ_LENGTH = 10;
export const CHOICES = 4;

/** Per question. Past this the answer is scored as missed and the run moves on. */
export const TIME_LIMIT_MS = 20_000;

export interface QuizAnswer {
  cardId: string;
  correct: boolean;
  elapsedMs: number;
}

export interface QuizResult {
  asked: number;
  correct: number;
  /** 0–1. A run of zero questions is 0, not a division by zero. */
  accuracy: number;
  bestStreak: number;
  points: number;
  elapsedMs: number;
}

export const BASE_POINTS = 100;

/**
 * Speed is worth at most half again as much as being right, and being wrong
 * quickly is worth nothing. Answering on the last second still scores the base,
 * so there is no reason to guess early to beat the clock.
 */
export function scoreAnswer(
  correct: boolean,
  elapsedMs: number,
  limit: number = TIME_LIMIT_MS,
): number {
  if (!correct) return 0;
  const remaining = Math.max(0, Math.min(limit, limit - elapsedMs)) / limit;
  return Math.round(BASE_POINTS * (1 + remaining * 0.5));
}

export function scoreRun(answers: QuizAnswer[], limit: number = TIME_LIMIT_MS): QuizResult {
  let correct = 0;
  let points = 0;
  let streak = 0;
  let bestStreak = 0;
  let elapsedMs = 0;

  for (const answer of answers) {
    elapsedMs += answer.elapsedMs;
    points += scoreAnswer(answer.correct, answer.elapsedMs, limit);
    if (answer.correct) {
      correct += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }

  return {
    asked: answers.length,
    correct,
    accuracy: answers.length === 0 ? 0 : correct / answers.length,
    bestStreak,
    points,
    elapsedMs,
  };
}

/**
 * A stable 32-bit hash (FNV-1a). Used only to lay the choices out, never for
 * anything that needs to be unguessable — the requirement is that one card
 * arranges its options the same way twice, not that nobody can predict it.
 */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Three distractors and the answer, in a fixed order.
 *
 * Distractors come from the same deck, which is the only source that makes them
 * plausible: four answers about Git are a question, whereas one about Git and
 * three about SQL are a giveaway. A deck too small to supply three offers fewer
 * options rather than padding with nonsense.
 */
export function choicesFor(card: Card, deck: Deck, count: number = CHOICES): string[] {
  const pool = deck.cards
    .filter((other) => other.id !== card.id && other.answer !== card.answer)
    .map((other) => other.answer);

  const unique = [...new Set(pool)];
  const wanted = Math.max(0, count - 1);
  const picked: string[] = [];
  const seed = hash(card.id);

  // Walk the pool from a per-card offset with a stride, taking the first
  // distinct answers found. Duplicates are skipped rather than retried, so this
  // terminates whatever the pool size is.
  for (let step = 0; step < unique.length && picked.length < wanted; step += 1) {
    const candidate = unique[(seed + step * 7) % unique.length];
    if (!picked.includes(candidate)) picked.push(candidate);
  }

  const options = [...picked, card.answer];
  // Rotate rather than sort: sorting puts the answer in a position correlated
  // with its own text, and alphabetical order is a tell.
  const offset = seed % options.length;
  return [...options.slice(offset), ...options.slice(0, offset)];
}
