import { describe, expect, it } from 'vitest';
import {
  QUEST_DIAL,
  QUEST_DIFFICULTIES,
  QUEST_TEMPLATES,
  inWords,
  shapeFor,
  shapesAt,
  templateById,
} from './templates';

describe('the templates', () => {
  it('has no duplicate ids — the id is what a stored quest carries', () => {
    const ids = QUEST_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('asks for at least one day at its base', () => {
    for (const t of QUEST_TEMPLATES) expect(t.base).toBeGreaterThan(0);
  });

  it('puts the number into the title', () => {
    for (const t of QUEST_TEMPLATES) {
      const title = t.title(4);
      expect(title.length).toBeGreaterThan(0);
      expect(title).toContain('four');
    }
  });

  it('says what counts, so nothing is a surprise', () => {
    for (const t of QUEST_TEMPLATES) expect(t.blurb.trim().length).toBeGreaterThan(0);
  });

  it('finds a template by id', () => {
    expect(templateById('move')?.measure).toBe('exerciseDays');
    expect(templateById('nothing')).toBeUndefined();
  });
});

describe('inWords', () => {
  it('spells a target so a title reads as a sentence', () => {
    expect(inWords(1)).toBe('one');
    expect(inWords(7)).toBe('seven');
  });

  it('falls back to the numeral past what it knows', () => {
    expect(inWords(40)).toBe('40');
  });
});

describe('the dial', () => {
  it('covers every difficulty', () => {
    for (const d of QUEST_DIFFICULTIES) expect(QUEST_DIAL[d]).toBeDefined();
  });

  it('makes a harder quest ask for more and pay more', () => {
    expect(QUEST_DIAL.easy.scale).toBeLessThan(QUEST_DIAL.steady.scale);
    expect(QUEST_DIAL.steady.scale).toBeLessThan(QUEST_DIAL.hard.scale);
    expect(QUEST_DIAL.easy.xp).toBeLessThan(QUEST_DIAL.steady.xp);
    expect(QUEST_DIAL.steady.xp).toBeLessThan(QUEST_DIAL.hard.xp);
  });

  it('keeps the week the same length at every difficulty', () => {
    // The difficulty is how much fits in the week, not how long the week is.
    const lengths = QUEST_DIFFICULTIES.map((d) => QUEST_DIAL[d].days);
    expect(new Set(lengths).size).toBe(1);
  });
});

describe('shapeFor', () => {
  it('scales the target with the difficulty', () => {
    const t = templateById('check-in')!;
    expect(shapeFor(t, 'easy').target).toBeLessThan(shapeFor(t, 'steady').target);
    expect(shapeFor(t, 'steady').target).toBeLessThan(shapeFor(t, 'hard').target);
  });

  it('never asks for a fraction of a day', () => {
    for (const t of QUEST_TEMPLATES) {
      for (const d of QUEST_DIFFICULTIES) {
        expect(Number.isInteger(shapeFor(t, d).target)).toBe(true);
      }
    }
  });

  /** A target of zero would be complete on creation and pay out for nothing. */
  it('never asks for nothing, however small the template and easy the dial', () => {
    for (const t of QUEST_TEMPLATES) {
      for (const d of QUEST_DIFFICULTIES) {
        expect(shapeFor(t, d).target).toBeGreaterThanOrEqual(1);
      }
    }
    // The case that would round to zero if it were not floored.
    const tiny = { id: 'tiny', measure: 'moodDays', base: 1, title: () => 't', blurb: 'b' } as const;
    expect(shapeFor(tiny, 'easy').target).toBe(1);
  });

  it('carries the template and difficulty through, so a row can be rebuilt', () => {
    const shape = shapeFor(templateById('move')!, 'hard');
    expect(shape.templateId).toBe('move');
    expect(shape.difficulty).toBe('hard');
    expect(shape.measure).toBe('exerciseDays');
    expect(shape.xp).toBe(QUEST_DIAL.hard.xp);
  });

  it('titles itself with the target it actually settled on', () => {
    const shape = shapeFor(templateById('check-in')!, 'easy');
    expect(shape.title).toContain(inWords(shape.target));
  });
});

describe('shapesAt', () => {
  it('offers every template', () => {
    expect(shapesAt('steady')).toHaveLength(QUEST_TEMPLATES.length);
  });

  it('offers them all at the difficulty asked for', () => {
    for (const shape of shapesAt('hard')) expect(shape.difficulty).toBe('hard');
  });
});
