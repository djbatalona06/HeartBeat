import { describe, expect, it } from 'vitest';
import { MAX_QUEUE, NEW_PER_DAY, buildQueue, dueCount, newCount, requeue } from './queue';
import { newProgress } from './srs';
import type { Card, CardProgress, Deck } from './types';

const AT = 1_700_000_000_000;
const TODAY = '2026-09-10';

function deckOf(count: number): Deck {
  const cards: Card[] = Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    deckId: 'js',
    question: `q${i}`,
    answer: `a${i}`,
    why: `because ${i}`,
    difficulty: 'easy',
  }));
  return { id: 'js', title: 'JavaScript', blurb: 'The language itself.', cards };
}

/** Progress for the named cards, each due on the given day. */
function progressFor(ids: Array<[string, string]>): Map<string, CardProgress> {
  const map = new Map<string, CardProgress>();
  for (const [id, dueOn] of ids) {
    map.set(id, { ...newProgress({ id, deckId: 'js' }, dueOn, AT), dueOn });
  }
  return map;
}

describe('building the queue', () => {
  it('offers new cards when nothing has been seen, capped at the daily intake', () => {
    const queue = buildQueue(deckOf(50), new Map(), TODAY);
    expect(queue).toHaveLength(NEW_PER_DAY);
    expect(queue[0].id).toBe('c0');
  });

  it('serves the most overdue card first', () => {
    const progress = progressFor([
      ['c0', '2026-09-09'],
      ['c1', '2026-09-01'],
      ['c2', '2026-09-08'],
    ]);
    const queue = buildQueue(deckOf(3), progress, TODAY, { newPerDay: 0 });
    expect(queue.map((c) => c.id)).toEqual(['c1', 'c2', 'c0']);
  });

  it('breaks ties by the deck order rather than at random', () => {
    const progress = progressFor([
      ['c2', TODAY],
      ['c0', TODAY],
      ['c1', TODAY],
    ]);
    const queue = buildQueue(deckOf(3), progress, TODAY, { newPerDay: 0 });
    expect(queue.map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
  });

  it('leaves out anything not due yet', () => {
    const progress = progressFor([
      ['c0', '2026-09-20'],
      ['c1', TODAY],
    ]);
    const queue = buildQueue(deckOf(2), progress, TODAY, { newPerDay: 0 });
    expect(queue.map((c) => c.id)).toEqual(['c1']);
  });

  it('refuses to introduce new material while a backlog fills the sitting', () => {
    const backlog: Array<[string, string]> = Array.from(
      { length: MAX_QUEUE },
      (_, i) => [`c${i}`, '2026-09-01'],
    );
    const queue = buildQueue(deckOf(MAX_QUEUE + 20), progressFor(backlog), TODAY);
    expect(queue).toHaveLength(MAX_QUEUE);
    expect(queue.every((card) => Number(card.id.slice(1)) < MAX_QUEUE)).toBe(true);
  });

  it('cuts the backlog rather than handing over a wall', () => {
    const backlog: Array<[string, string]> = Array.from(
      { length: 100 },
      (_, i) => [`c${i}`, '2026-08-01'],
    );
    expect(buildQueue(deckOf(100), progressFor(backlog), TODAY)).toHaveLength(MAX_QUEUE);
  });

  it('is deterministic — the same day and the same progress give the same list', () => {
    const deck = deckOf(30);
    const progress = progressFor([['c5', '2026-09-02'], ['c9', '2026-09-05']]);
    const a = buildQueue(deck, progress, TODAY);
    const b = buildQueue(deck, progress, TODAY);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});

describe('counts for the tile', () => {
  it('counts the whole backlog, past the sitting cap', () => {
    const backlog: Array<[string, string]> = Array.from(
      { length: 70 },
      (_, i) => [`c${i}`, '2026-08-01'],
    );
    expect(dueCount(deckOf(70), progressFor(backlog), TODAY)).toBe(70);
  });

  it('counts what has never been graded', () => {
    expect(newCount(deckOf(10), progressFor([['c0', TODAY]]))).toBe(9);
  });
});

describe('requeue', () => {
  it('moves the card to the back of tonight rather than out of it', () => {
    const queue = deckOf(4).cards;
    expect(requeue(queue, 0).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c0']);
  });

  it('leaves an out-of-range index alone', () => {
    const queue = deckOf(3).cards;
    expect(requeue(queue, 9)).toBe(queue);
    expect(requeue(queue, -1)).toBe(queue);
  });
});
