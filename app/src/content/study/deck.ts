import type { Card, Deck } from '../../domain/study/types';

/**
 * A card seed: everything but the deck it belongs to, which the builder fills
 * in so no deck file has to repeat its own name two hundred times.
 *
 * **The id is written by hand and is permanent.** It is the key progress is
 * stored under, so a card whose id changes is a card whose schedule is thrown
 * away — the learner meets a fact they have known for a month as though it were
 * new. Ids are therefore never derived from the position in the array, never
 * from the question text, and never renumbered to close a gap when a card is
 * deleted. `decks.test.ts` fails the build if two ever collide.
 */
export type CardSeed = Omit<Card, 'deckId'>;

export function deck(
  id: string,
  title: string,
  blurb: string,
  seeds: CardSeed[],
): Deck {
  return { id, title, blurb, cards: seeds.map((seed) => ({ ...seed, deckId: id })) };
}
