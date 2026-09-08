import { bigoDeck } from './bigo';
import { gitDeck } from './git';
import { httpDeck } from './http';
import { jsDeck } from './js';
import { practiceDeck } from './practice';
import { reactDeck } from './react';
import { shellDeck } from './shell';
import { sqlDeck } from './sql';
import { typescriptDeck } from './typescript';
import type { Deck } from '../../domain/study/types';

/**
 * The deck registry. A new deck is added here and nowhere else — the picker,
 * the dashboard tile and the standalone build all read this list, the same way
 * the theme registry works.
 *
 * Order is the order they are offered in, and it is deliberate: the language
 * first, then the tools around it, then the ideas that outlive both.
 */
export const DECKS: Deck[] = [
  jsDeck,
  typescriptDeck,
  reactDeck,
  gitDeck,
  httpDeck,
  sqlDeck,
  bigoDeck,
  shellDeck,
  practiceDeck,
];

export function getDeck(id: string): Deck | undefined {
  return DECKS.find((deck) => deck.id === id);
}

/** Every card across every deck, for the counts on the dashboard tile. */
export function allCards() {
  return DECKS.flatMap((deck) => deck.cards);
}
