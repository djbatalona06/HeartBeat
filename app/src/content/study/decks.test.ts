import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DECKS, allCards, getDeck } from './index';
import { DIFFICULTY_WEIGHT } from '../../domain/rpg/types';
import { choicesFor } from '../../domain/study/quiz';

/**
 * The content is data, and data rots quietly. These are the checks that make a
 * half-written card fail the build rather than turn up in a session at eleven
 * at night with an empty answer.
 *
 * The id-uniqueness test is the important one: ids are the key progress is
 * stored under, so a collision does not look like a bug — it looks like two
 * cards sharing one schedule, which is very hard to notice from the outside.
 */

describe('the registry', () => {
  it('has decks, and they have cards', () => {
    expect(DECKS.length).toBeGreaterThan(0);
    for (const deck of DECKS) expect(deck.cards.length).toBeGreaterThan(0);
  });

  it('gives every deck a distinct id', () => {
    const ids = DECKS.map((deck) => deck.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('finds a deck by id and returns undefined for one that does not exist', () => {
    expect(getDeck(DECKS[0].id)?.title).toBe(DECKS[0].title);
    expect(getDeck('no-such-deck')).toBeUndefined();
  });

  it('gives every deck a title and a blurb', () => {
    for (const deck of DECKS) {
      expect(deck.title.trim()).not.toBe('');
      expect(deck.blurb.trim()).not.toBe('');
    }
  });

  it('registers every deck file that exists', async () => {
    // Written after a deck was authored, saved, and then silently left out of
    // the registry — which nothing else here could have caught, because an
    // unregistered deck is well-formed in every way except being reachable.
    const here = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(here).filter(
      (name) => name.endsWith('.ts')
        && !name.endsWith('.test.ts')
        && name !== 'index.ts'
        && name !== 'deck.ts',
    );
    expect(files.length).toBeGreaterThan(0);

    const registered = new Set(DECKS.map((deck) => deck.id));
    for (const file of files) {
      const name = file.slice(0, -'.ts'.length);
      const module = (await import(`./${name}.ts`)) as Record<string, unknown>;
      const exported = Object.values(module).filter(
        (value): value is { id: string } =>
          typeof value === 'object' && value !== null && 'cards' in value,
      );
      expect(exported.length, file).toBeGreaterThan(0);
      for (const deck of exported) expect(registered.has(deck.id), file).toBe(true);
    }
  });
});

describe('card ids', () => {
  it('are unique across every deck, not merely within one', () => {
    const ids = allCards().map((card) => card.id);
    const seen = new Set<string>();
    const collisions = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(collisions).toEqual([]);
  });

  it('carry the deck they belong to', () => {
    for (const deck of DECKS) {
      for (const card of deck.cards) expect(card.deckId).toBe(deck.id);
    }
  });
});

describe('every card', () => {
  const cards = allCards();

  it('has a question, an answer and a why', () => {
    for (const card of cards) {
      expect(card.question.trim(), card.id).not.toBe('');
      expect(card.answer.trim(), card.id).not.toBe('');
      expect(card.why.trim(), card.id).not.toBe('');
    }
  });

  it('has a difficulty the payout knows how to price', () => {
    for (const card of cards) {
      expect(DIFFICULTY_WEIGHT[card.difficulty], card.id).toBeDefined();
    }
  });

  it('asks a question rather than stating a heading', () => {
    for (const card of cards) {
      expect(card.question.length, card.id).toBeGreaterThan(10);
    }
  });

  it('explains rather than repeating the answer', () => {
    for (const card of cards) {
      expect(card.why.trim(), card.id).not.toBe(card.answer.trim());
      expect(card.why.length, card.id).toBeGreaterThan(40);
    }
  });
});

describe('quiz mode against the real content', () => {
  it('can build four distinct choices for every card in every deck', () => {
    for (const deck of DECKS) {
      for (const card of deck.cards) {
        const options = choicesFor(card, deck);
        expect(options, card.id).toContain(card.answer);
        expect(new Set(options).size, card.id).toBe(options.length);
        expect(options.length, card.id).toBe(4);
      }
    }
  });
});

describe('the bank as a whole', () => {
  it('is big enough to be worth opening', () => {
    expect(allCards().length).toBeGreaterThanOrEqual(150);
  });

  it('is not all one difficulty', () => {
    const spread = new Set(allCards().map((card) => card.difficulty));
    expect(spread.size).toBeGreaterThan(2);
  });
});
