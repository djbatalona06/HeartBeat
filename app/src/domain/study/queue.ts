import type { DayKey } from '../types';
import { isDue, overdueBy } from './srs';
import type { Card, CardProgress, Deck } from './types';

/**
 * What to study today, and in what order.
 *
 * Two caps, both of which exist to stop the app being the thing that makes you
 * quit. A deck of two hundred cards left alone for a fortnight has a hundred
 * due, and a hundred-card queue is not a study session, it is a wall. So the
 * backlog is served oldest-first and cut at a length you can actually finish,
 * and the rest simply waits — which costs nothing, because nothing in this
 * layer can charge you for waiting.
 */

/** New cards introduced per deck per day. Enough to learn, few enough to keep. */
export const NEW_PER_DAY = 12;

/** The longest queue offered in one sitting. */
export const MAX_QUEUE = 40;

export interface QueueOptions {
  newPerDay?: number;
  max?: number;
}

/**
 * Deliberately deterministic — no shuffle, no seed.
 *
 * A shuffled queue means the same backlog produces a different session every
 * time it is rebuilt, and this queue is rebuilt on every mount. The order is
 * therefore fixed by the data: most overdue first, ties broken by the deck's
 * own order, then whatever new cards fit. Two calls on the same day with the
 * same progress return the same list, which is also what makes it testable.
 */
export function buildQueue(
  deck: Deck,
  progress: Map<string, CardProgress>,
  day: DayKey,
  options: QueueOptions = {},
): Card[] {
  const newPerDay = options.newPerDay ?? NEW_PER_DAY;
  const max = options.max ?? MAX_QUEUE;

  const seen: Array<{ card: Card; late: number; rank: number }> = [];
  const fresh: Card[] = [];

  deck.cards.forEach((card, rank) => {
    const state = progress.get(card.id);
    if (!state) {
      fresh.push(card);
      return;
    }
    if (isDue(state, day)) seen.push({ card, late: overdueBy(state, day), rank });
  });

  seen.sort((a, b) => b.late - a.late || a.rank - b.rank);

  // Due work comes before new work without exception. Meeting new material
  // while a backlog grows behind it is the failure mode every spaced-repetition
  // app has, and the only reliable fix is to refuse to introduce more.
  const due = seen.slice(0, max).map((entry) => entry.card);
  const room = Math.max(0, Math.min(max - due.length, newPerDay));
  return due.concat(fresh.slice(0, room));
}

/** What the dashboard tile reads. Counts the whole backlog, uncapped. */
export function dueCount(deck: Deck, progress: Map<string, CardProgress>, day: DayKey): number {
  return deck.cards.reduce((n, card) => {
    const state = progress.get(card.id);
    if (!state) return n;
    return n + (isDue(state, day) ? 1 : 0);
  }, 0);
}

/** Cards in this deck never yet graded. */
export function newCount(deck: Deck, progress: Map<string, CardProgress>): number {
  return deck.cards.reduce((n, card) => n + (progress.has(card.id) ? 0 : 1), 0);
}

/**
 * `again` sends a card to the back of the sitting rather than out of it.
 *
 * The alternative — dropping it and letting tomorrow's queue pick it up — is
 * worse in the one case that matters: the card you could not remember is
 * exactly the one worth meeting a second time tonight, while the answer you
 * have only now read is still in front of you.
 */
export function requeue(queue: Card[], index: number): Card[] {
  if (index < 0 || index >= queue.length) return queue;
  const card = queue[index];
  return [...queue.slice(0, index), ...queue.slice(index + 1), card];
}
