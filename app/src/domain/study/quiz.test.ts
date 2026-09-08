import { describe, expect, it } from 'vitest';
import { BASE_POINTS, TIME_LIMIT_MS, choicesFor, hash, scoreAnswer, scoreRun } from './quiz';
import type { Card, Deck } from './types';

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

describe('scoring one answer', () => {
  it('pays nothing for a wrong answer, however fast', () => {
    expect(scoreAnswer(false, 0)).toBe(0);
    expect(scoreAnswer(false, TIME_LIMIT_MS)).toBe(0);
  });

  it('pays the base for a right answer on the last second', () => {
    expect(scoreAnswer(true, TIME_LIMIT_MS)).toBe(BASE_POINTS);
  });

  it('pays half again for an instant one', () => {
    expect(scoreAnswer(true, 0)).toBe(Math.round(BASE_POINTS * 1.5));
  });

  it('never pays more than the instant answer, even past the limit', () => {
    expect(scoreAnswer(true, TIME_LIMIT_MS * 3)).toBe(BASE_POINTS);
    expect(scoreAnswer(true, -100)).toBeLessThanOrEqual(Math.round(BASE_POINTS * 1.5));
  });
});

describe('scoring a run', () => {
  it('reports an empty run as zero rather than dividing by it', () => {
    expect(scoreRun([])).toEqual({
      asked: 0, correct: 0, accuracy: 0, bestStreak: 0, points: 0, elapsedMs: 0,
    });
  });

  it('counts accuracy and the best streak, not the last one', () => {
    const result = scoreRun([
      { cardId: 'a', correct: true, elapsedMs: 1000 },
      { cardId: 'b', correct: true, elapsedMs: 1000 },
      { cardId: 'c', correct: true, elapsedMs: 1000 },
      { cardId: 'd', correct: false, elapsedMs: 1000 },
      { cardId: 'e', correct: true, elapsedMs: 1000 },
    ]);
    expect(result.asked).toBe(5);
    expect(result.correct).toBe(4);
    expect(result.accuracy).toBeCloseTo(0.8);
    expect(result.bestStreak).toBe(3);
  });

  it('sums the time actually spent', () => {
    const result = scoreRun([
      { cardId: 'a', correct: true, elapsedMs: 1500 },
      { cardId: 'b', correct: false, elapsedMs: 2500 },
    ]);
    expect(result.elapsedMs).toBe(4000);
  });
});

describe('choices', () => {
  const deck = deckOf(20);

  it('puts the answer among them exactly once', () => {
    for (const card of deck.cards) {
      const options = choicesFor(card, deck);
      expect(options.filter((o) => o === card.answer)).toHaveLength(1);
    }
  });

  it('offers four, all distinct', () => {
    const options = choicesFor(deck.cards[0], deck);
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
  });

  it('draws every distractor from the same deck', () => {
    const answers = new Set(deck.cards.map((c) => c.answer));
    for (const option of choicesFor(deck.cards[3], deck)) {
      expect(answers.has(option)).toBe(true);
    }
  });

  it('lays the same card out the same way twice', () => {
    expect(choicesFor(deck.cards[7], deck)).toEqual(choicesFor(deck.cards[7], deck));
  });

  it('does not park the answer in one position for every card', () => {
    const positions = new Set(
      deck.cards.map((card) => choicesFor(card, deck).indexOf(card.answer)),
    );
    expect(positions.size).toBeGreaterThan(1);
  });

  it('offers fewer rather than padding a deck too small to fill four', () => {
    const tiny = deckOf(2);
    const options = choicesFor(tiny.cards[0], tiny);
    expect(options).toHaveLength(2);
    expect(options).toContain('a0');
  });

  it('survives a deck of one', () => {
    const single = deckOf(1);
    expect(choicesFor(single.cards[0], single)).toEqual(['a0']);
  });
});

describe('the hash', () => {
  it('is stable and unsigned', () => {
    expect(hash('c1')).toBe(hash('c1'));
    expect(hash('c1')).toBeGreaterThanOrEqual(0);
    expect(hash('c1')).not.toBe(hash('c2'));
  });
});
