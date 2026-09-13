import { describe, expect, it } from 'vitest';
import { SUPPORT_IDEAS, ideaById, ideasFor, ideasForDay } from './ideas';
import { QUOTES, quoteById, quoteForDay, quotesFor } from './quotes';
import { SUPPORT_LANES } from './lanes';

const DAY = '2026-09-25';
const OTHER_DAY = '2026-09-26';

describe('the content tables', () => {
  it('has a unique id for everything', () => {
    const ids = [...SUPPORT_IDEAS.map((i) => i.id), ...QUOTES.map((q) => q.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Every lane has to be able to fill a screen. A lane that `lanesFor` can
   * return but no table has content for is a blank panel with a heading on it.
   */
  it('has ideas and a quote for every lane a person can be given', () => {
    for (const lane of SUPPORT_LANES) {
      expect(ideasFor(lane).length, lane).toBeGreaterThan(0);
      expect(quotesFor(lane).length, lane).toBeGreaterThan(0);
    }
  });

  it('has both a tip and a gift wherever the screen offers both', () => {
    for (const lane of SUPPORT_LANES) {
      const kinds = new Set(ideasFor(lane).map((i) => i.kind));
      expect(kinds.has('tip'), lane).toBe(true);
    }
  });

  it('looks an item up by id, and says nothing for one that is not there', () => {
    expect(ideaById('gen-walk')?.lane).toBe('general');
    expect(ideaById('nope')).toBeUndefined();
    expect(ideaById(undefined)).toBeUndefined();
    expect(quoteById('q-gen-today')?.lane).toBe('general');
    expect(quoteById(undefined)).toBeUndefined();
  });
});

describe('picking for a day', () => {
  /** Reopening the screen must not reshuffle the thing you were about to do. */
  it('gives the same day the same answer', () => {
    expect(ideasForDay(DAY, 'general')).toEqual(ideasForDay(DAY, 'general'));
    expect(quoteForDay(DAY, 'general')).toEqual(quoteForDay(DAY, 'general'));
  });

  it('moves on with the date', () => {
    const today = [...ideasForDay(DAY, 'general'), quoteForDay(DAY, 'general')];
    const tomorrow = [...ideasForDay(OTHER_DAY, 'general'), quoteForDay(OTHER_DAY, 'general')];
    expect(today).not.toEqual(tomorrow);
  });

  it('offers one of each kind rather than two of the same', () => {
    for (const lane of SUPPORT_LANES) {
      const picked = ideasForDay(DAY, lane);
      expect(new Set(picked.map((i) => i.kind)).size, lane).toBe(picked.length);
    }
  });

  it('stays inside the lane it was asked for', () => {
    for (const lane of SUPPORT_LANES) {
      for (const idea of ideasForDay(DAY, lane)) expect(idea.lane, lane).toBe(lane);
      expect(quoteForDay(DAY, lane)?.lane, lane).toBe(lane);
    }
  });
});
