import { describe, expect, it } from 'vitest';
import {
  advance,
  coversDay,
  daysLeft,
  isActive,
  isDifficulty,
  markComplete,
  markRetired,
  newQuest,
  reckon,
  seedFrom,
  shapeOf,
  suggestDifficulty,
} from './engine';
import { QUEST_DIAL, shapeFor, shapesAt, templateById } from './templates';
import type { Quest } from '../types';

const END_OF_DAY = (day: string) => Date.parse(`${day}T23:59:59.999Z`);
const SHAPE = shapeFor(templateById('move')!, 'steady');

const mint = (over: Partial<Quest> = {}): Quest => ({
  ...newQuest(SHAPE, 'couple-1', '2026-03-01', 'q1', END_OF_DAY),
  ...over,
});

describe('newQuest', () => {
  it('starts at nothing', () => {
    expect(mint().progress).toBe(0);
  });

  it('gives seven days of chances, not six and a bit', () => {
    // endsOn is inclusive, so a seven-day quest starting on the 1st ends on
    // the 7th — not the 8th, and not the 6th.
    const quest = mint();
    expect(quest.startedOn).toBe('2026-03-01');
    expect(quest.endsOn).toBe('2026-03-07');
    expect(quest.expiresAt).toBe(END_OF_DAY('2026-03-07'));
  });

  it('carries the shape it was minted from', () => {
    const quest = mint();
    expect(quest.templateId).toBe('move');
    expect(quest.difficulty).toBe('steady');
    expect(quest.target).toBe(SHAPE.target);
    expect(quest.xp).toBe(QUEST_DIAL.steady.xp);
  });

  it('is not finished the moment it is made', () => {
    expect(reckon(mint(), '2026-03-01').verb).toBe('running');
  });
});

describe('coversDay', () => {
  it('includes the first day and the last', () => {
    const q = mint();
    expect(coversDay(q, '2026-03-01')).toBe(true);
    expect(coversDay(q, '2026-03-07')).toBe(true);
  });

  it('excludes before and after', () => {
    const q = mint();
    expect(coversDay(q, '2026-02-28')).toBe(false);
    expect(coversDay(q, '2026-03-08')).toBe(false);
  });

  it('covers everything for a row from before the window was stored', () => {
    // The fields are optional so a quest already in the shared table parses.
    const old = { ...mint(), startedOn: undefined, endsOn: undefined };
    expect(coversDay(old, '2020-01-01')).toBe(true);
  });
});

describe('advance', () => {
  it('sets progress to what was measured', () => {
    expect(advance(mint(), 2).progress).toBe(2);
  });

  it('clamps at the target so a quest never reads past its own bar', () => {
    const q = mint();
    expect(advance(q, q.target + 50).progress).toBe(q.target);
  });

  /** A deleted row must not walk a quest backwards. */
  it('never goes down', () => {
    const q = advance(mint(), 3);
    expect(advance(q, 1).progress).toBe(3);
    expect(advance(q, 0).progress).toBe(3);
  });

  it('returns the same object when nothing moved, so a write can be skipped', () => {
    const q = advance(mint(), 2);
    expect(advance(q, 2)).toBe(q);
  });

  it('ignores a fractional measurement', () => {
    expect(advance(mint(), 2.9).progress).toBe(2);
  });
});

describe('reckon — a quest pays once', () => {
  it('is running before the target', () => {
    const step = reckon(advance(mint(), 1), '2026-03-02');
    expect(step.verb).toBe('running');
    expect(step.award).toBe(0);
  });

  it('completes on the transition, and is worth its XP', () => {
    const q = advance(mint(), SHAPE.target);
    const step = reckon(q, '2026-03-03');
    expect(step.verb).toBe('complete');
    expect(step.award).toBe(SHAPE.xp);
  });

  /**
   * The rule the whole module is arranged around. Without the `completedAt`
   * guard, every reconcile after the target was reached pays out again.
   */
  it('pays nothing the second time', () => {
    const done = markComplete(advance(mint(), SHAPE.target), 1_700_000_000_000);
    const step = reckon(done, '2026-03-04');
    expect(step.verb).toBe('settled');
    expect(step.award).toBe(0);
  });

  it('pays nothing when progress overshoots after completion', () => {
    const done = markComplete(mint(), 1_700_000_000_000);
    const over = advance(done, SHAPE.target + 10);
    expect(reckon(over, '2026-03-05').award).toBe(0);
  });

  it('expires when the week runs out unfinished — and takes nothing', () => {
    const step = reckon(advance(mint(), 1), '2026-03-08');
    expect(step.verb).toBe('expired');
    expect(step.award).toBe(0);
  });

  it('counts a quest finished on its last day as finished, not expired', () => {
    const step = reckon(advance(mint(), SHAPE.target), '2026-03-07');
    expect(step.verb).toBe('complete');
  });

  it('leaves a retired quest alone', () => {
    const gone = markRetired(mint(), 1_700_000_000_000);
    expect(reckon(gone, '2026-03-09').verb).toBe('settled');
    expect(isActive(gone)).toBe(false);
  });
});

describe('markComplete', () => {
  it('stamps the quest and fills its bar', () => {
    const done = markComplete(advance(mint(), 1), 42);
    expect(done.completedAt).toBe(42);
    expect(done.progress).toBe(SHAPE.target);
    expect(isActive(done)).toBe(false);
  });
});

describe('seedFrom', () => {
  it('offers every shape, just in a different order', () => {
    const shapes = shapesAt('steady');
    const seeded = seedFrom(shapes, { exerciseDays: 2 }, 7);
    expect(seeded).toHaveLength(shapes.length);
    expect(new Set(seeded.map((s) => s.templateId)))
      .toEqual(new Set(shapes.map((s) => s.templateId)));
  });

  it('puts something half-done ahead of something never touched', () => {
    const shapes = shapesAt('steady');
    const move = shapes.find((s) => s.templateId === 'move')!;
    const seeded = seedFrom(shapes, { exerciseDays: Math.round(move.target / 2) }, 7);
    expect(seeded[0].templateId).toBe('move');
  });

  it('does not lead with what they already do every day', () => {
    // Half-finished before starting is not much of an offer either.
    const shapes = shapesAt('steady');
    const seeded = seedFrom(shapes, { exerciseDays: 99 }, 7);
    expect(seeded[seeded.length - 1].templateId).toBe('move');
  });

  it('is stable with no history at all', () => {
    const a = seedFrom(shapesAt('easy'), {}, 7).map((s) => s.templateId);
    const b = seedFrom(shapesAt('easy'), {}, 7).map((s) => s.templateId);
    expect(a).toEqual(b);
  });
});

describe('suggestDifficulty', () => {
  it('starts a couple who have done nothing on easy', () => {
    expect(suggestDifficulty({})).toBe('easy');
    expect(suggestDifficulty({ moodDays: 1 })).toBe('easy');
  });

  it('moves up with what they have been doing', () => {
    expect(suggestDifficulty({ moodDays: 3 })).toBe('steady');
    expect(suggestDifficulty({ moodDays: 6 })).toBe('hard');
  });

  it('reads the busiest measure, not the sum', () => {
    expect(suggestDifficulty({ moodDays: 1, exerciseDays: 1, noteDays: 1 })).toBe('easy');
  });
});

describe('shapeOf', () => {
  it('rebuilds the shape a stored quest came from', () => {
    expect(shapeOf(mint())?.templateId).toBe('move');
  });

  it('gives nothing for a template that no longer exists', () => {
    // A renamed template leaves rows behind; they must not crash a screen.
    expect(shapeOf({ ...mint(), templateId: 'retired' })).toBeUndefined();
  });
});

describe('isDifficulty', () => {
  it('accepts the three', () => {
    expect(isDifficulty('easy')).toBe(true);
    expect(isDifficulty('steady')).toBe(true);
    expect(isDifficulty('hard')).toBe(true);
  });

  it('refuses anything else arriving from a select or a stored row', () => {
    expect(isDifficulty('impossible')).toBe(false);
    expect(isDifficulty(undefined)).toBe(false);
    expect(isDifficulty(2)).toBe(false);
  });
});

describe('daysLeft', () => {
  it('counts today as one of them', () => {
    // A quest ending today has one day left, not none — endsOn is inclusive,
    // and the day it ends is a day it can still be finished on.
    expect(daysLeft(mint(), '2026-03-07')).toBe(1);
  });

  it('counts the whole window on the first day', () => {
    expect(daysLeft(mint(), '2026-03-01')).toBe(7);
  });

  it('never goes negative', () => {
    // "minus three days left" is not a thing to put on a screen.
    expect(daysLeft(mint(), '2026-03-20')).toBe(0);
  });

  it('has nothing to say about a row with no window stored', () => {
    expect(daysLeft({ ...mint(), endsOn: undefined }, '2026-03-01')).toBeNull();
  });
});

describe('seedFrom on a longer window than the quest', () => {
  const shapes = shapesAt('steady');

  /**
   * `recent` is counted over a fortnight and the target is for a week, so the
   * two have to be put on the same footing before they are compared. They were
   * not, and the picker led with the things the couple had never done.
   */
  it('prefers a habit they already have to one they have never had', () => {
    const move = shapes.find((s) => s.templateId === 'move')!;
    // Twice a week over the fortnight: half of a four-day target.
    const seeded = seedFrom(shapes, { exerciseDays: move.target }, 14);
    expect(seeded[0].templateId).toBe('move');
  });

  it('still puts what they do every single day last', () => {
    const seeded = seedFrom(shapes, { exerciseDays: 14 }, 14);
    expect(seeded[seeded.length - 1].templateId).toBe('move');
  });

  it('treats a zero-length window as already on the right scale', () => {
    expect(() => seedFrom(shapes, { exerciseDays: 3 }, 0)).not.toThrow();
  });
});
