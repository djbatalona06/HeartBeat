import { describe, expect, it } from 'vitest';
import {
  EASE_CEILING,
  EASE_FLOOR,
  EASE_START,
  MAX_INTERVAL,
  adjustEase,
  clampEase,
  isDue,
  newProgress,
  nextInterval,
  overdueBy,
  review,
} from './srs';
import type { CardProgress, Grade } from './types';

const AT = 1_700_000_000_000;
const DAY = '2026-09-01';

const card = { id: 'c1', deckId: 'js' };

function fresh(): CardProgress {
  return newProgress(card, DAY, AT);
}

/** Grade a card repeatedly, returning the state after the last press. */
function run(grades: Grade[], from: CardProgress = fresh(), start: string = DAY): CardProgress {
  let state = from;
  let day = start;
  for (const grade of grades) {
    state = review(state, grade, day, AT);
    day = state.dueOn;
  }
  return state;
}

describe('ease', () => {
  it('starts at the 2.5 SM-2 itself starts at', () => {
    expect(fresh().ease).toBe(EASE_START);
  });

  it('holds between the floor and the ceiling', () => {
    expect(clampEase(0.1)).toBe(EASE_FLOOR);
    expect(clampEase(99)).toBe(EASE_CEILING);
    expect(clampEase(Number.NaN)).toBe(EASE_START);
  });

  it('falls on again and hard, rises on easy, and barely moves on good', () => {
    expect(adjustEase(EASE_START, 'again')).toBeLessThan(EASE_START);
    expect(adjustEase(EASE_START, 'hard')).toBeLessThan(EASE_START);
    expect(adjustEase(EASE_START, 'good')).toBeCloseTo(EASE_START, 5);
    expect(adjustEase(EASE_START, 'easy')).toBeGreaterThan(EASE_START);
  });

  it('cannot be driven below the floor by any number of bad nights', () => {
    let ease = EASE_START;
    for (let i = 0; i < 50; i += 1) ease = adjustEase(ease, 'again');
    expect(ease).toBe(EASE_FLOOR);
  });

  it('dents on again rather than demolishing, unlike SM-2 quality zero', () => {
    // SM-2 at q=0 costs 0.1 - 5*(0.08 + 5*0.02) = 0.8 of ease in one press,
    // two-thirds of the span between the floor and the start. Mapping `again`
    // to 2 instead costs 0.32, and this is the test that pins that choice.
    const zeroCost = 0.8;
    const againCost = EASE_START - adjustEase(EASE_START, 'again');
    expect(againCost).toBeCloseTo(0.32, 5);
    expect(againCost).toBeLessThan(zeroCost / 2);
  });
});

describe('intervals', () => {
  it('walks 1 then 6 then multiplies, which is the part of SM-2 worth keeping', () => {
    const first = review(fresh(), 'good', DAY, AT);
    expect(first.interval).toBe(1);

    const second = review(first, 'good', first.dueOn, AT);
    expect(second.interval).toBe(6);

    const third = review(second, 'good', second.dueOn, AT);
    expect(third.interval).toBeGreaterThan(6);
  });

  it('always moves at least one day further than last time', () => {
    const state: CardProgress = { ...fresh(), interval: 10, streak: 5, ease: EASE_FLOOR };
    expect(nextInterval(state, 'hard', EASE_FLOOR)).toBeGreaterThan(10);
  });

  it('caps at a year', () => {
    const state: CardProgress = { ...fresh(), interval: 900, streak: 20, ease: EASE_CEILING };
    expect(nextInterval(state, 'easy', EASE_CEILING)).toBe(MAX_INTERVAL);
  });

  it('sends again back to today rather than to the beginning', () => {
    const known = run(['good', 'good', 'good', 'good']);
    expect(known.interval).toBeGreaterThan(6);

    const lapsed = review(known, 'again', known.dueOn, AT);
    expect(lapsed.interval).toBe(0);
    expect(lapsed.dueOn).toBe(known.dueOn);
    // The ease it earned survives the lapse, which is the whole difference
    // between this and a canonical SM-2 reset.
    expect(lapsed.ease).toBeGreaterThan(EASE_FLOOR);
  });

  it('grows a well-known card faster than a merely-passed one', () => {
    const easy = run(['easy', 'easy', 'easy', 'easy']);
    const good = run(['good', 'good', 'good', 'good']);
    expect(easy.interval).toBeGreaterThan(good.interval);
  });
});

describe('a review', () => {
  it('counts the streak and resets it only on again', () => {
    expect(run(['good', 'good', 'hard']).streak).toBe(3);
    expect(run(['good', 'good', 'again']).streak).toBe(0);
  });

  it('does not count the first meeting as a lapse', () => {
    const first = review(fresh(), 'again', DAY, AT);
    expect(first.reviews).toBe(1);
    expect(first.lapses).toBe(0);
  });

  it('counts forgetting something already known', () => {
    const known = run(['good', 'good']);
    expect(review(known, 'again', known.dueOn, AT).lapses).toBe(1);
  });

  it('has no branch that can subtract from the learner', () => {
    // Structural, not behavioural: every field a review returns is a schedule
    // or a count. If a cost is ever added, this list stops matching and the
    // ruling has to be argued for rather than slipped in.
    const after = review(fresh(), 'again', DAY, AT);
    expect(Object.keys(after).sort()).toEqual([
      'cardId', 'deckId', 'dueOn', 'ease', 'interval', 'lapses',
      'lastReviewedOn', 'reviews', 'streak', 'updatedAt',
    ]);
  });
});

describe('due', () => {
  it('is true on the day and after it, false before', () => {
    const state = { dueOn: '2026-09-10' };
    expect(isDue(state, '2026-09-09')).toBe(false);
    expect(isDue(state, '2026-09-10')).toBe(true);
    expect(isDue(state, '2026-09-12')).toBe(true);
  });

  it('measures lateness for ordering', () => {
    expect(overdueBy({ dueOn: '2026-09-01' }, '2026-09-05')).toBe(4);
    expect(overdueBy({ dueOn: '2026-09-05' }, '2026-09-01')).toBe(-4);
  });
});

describe('a fortnight of one card', () => {
  it('schedules further out each time it comes back known', () => {
    let state = fresh();
    let day = DAY;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      state = review(state, 'good', day, AT);
      intervals.push(state.interval);
      day = state.dueOn;
    }
    const ascending = intervals.every((n, i) => i === 0 || n > intervals[i - 1]);
    expect(ascending).toBe(true);
    expect(intervals[0]).toBe(1);
  });
});
