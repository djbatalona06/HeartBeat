import { describe, expect, it } from 'vitest';
import {
  AREAS,
  SUGGESTIONS,
  areaById,
  areaProgress,
  suggestionById,
  suggestionsFor,
  tailoredFor,
} from './selfCare';
import { STARTER_FIXED, STARTER_ROTATION_POOL } from './starterPlan';
import { AREA_IDS, DIFFICULTY_WEIGHT, type AreaId, type Task } from './types';
import { newTask } from './task';

const AT = 1_700_000_000_000;

function goal(over: Partial<Task> = {}): Task {
  return {
    ...newTask(
      { id: 'g1', coupleId: 'c1', memberId: 'm1', type: 'goal', title: 'A goal', difficulty: 'easy' },
      AT,
      '2026-09-01',
    ),
    ...over,
  };
}

describe('the areas', () => {
  it('has exactly one entry per area id, in the same order', () => {
    expect(AREAS.map((a) => a.id)).toEqual([...AREA_IDS]);
  });

  it('gives every area a name and a blurb', () => {
    for (const area of AREAS) {
      expect(area.name.trim().length, area.id).toBeGreaterThan(0);
      expect(area.blurb.trim().length, area.id).toBeGreaterThan(0);
    }
  });

  it('finds an area by id, and nothing by a made-up one', () => {
    expect(areaById('body')?.name).toBe('Body');
    expect(areaById('nonsense' as AreaId)).toBeUndefined();
  });
});

describe('the suggestion catalogue', () => {
  it('repeats no id', () => {
    // Ids are written onto tasks as `suggestionId` and read back to tell
    // whether a goal is already adopted, so a duplicate would make one goal
    // suppress a different suggestion.
    expect(new Set(SUGGESTIONS.map((s) => s.id)).size).toBe(SUGGESTIONS.length);
  });

  it('repeats no title', () => {
    expect(new Set(SUGGESTIONS.map((s) => s.title)).size).toBe(SUGGESTIONS.length);
  });

  it('files every suggestion under a real area, at a real difficulty', () => {
    for (const s of SUGGESTIONS) {
      expect(AREA_IDS, s.id).toContain(s.area);
      expect(DIFFICULTY_WEIGHT[s.difficulty], s.id).toBeGreaterThan(0);
    }
  });

  it('never offers a self-care suggestion that announces itself as hard', () => {
    // A suggestion labelled `hard` is one that gets skipped; anything genuinely
    // hard is a goal somebody should be writing in their own words.
    for (const s of SUGGESTIONS) expect(s.difficulty, s.id).not.toBe('hard');
  });

  it('leaves no area thin enough to exhaust in a week', () => {
    for (const id of AREA_IDS) {
      expect(suggestionsFor(id).length, id).toBeGreaterThanOrEqual(8);
    }
  });

  it('returns only that area from suggestionsFor', () => {
    for (const id of AREA_IDS) {
      for (const s of suggestionsFor(id)) expect(s.area).toBe(id);
    }
  });

  it('looks one up by id', () => {
    expect(suggestionById('body-water')?.title).toBe('Drink water');
    expect(suggestionById('nope')).toBeUndefined();
  });
});

/**
 * The starter plan used to hold its own eighteen literals. It now names ids out
 * of this catalogue, which is only an improvement as long as the ids resolve —
 * `starterPlan.ts` throws at import if one does not, so these pin the shape
 * that throw is protecting.
 */
describe('the starter plan draws from the same catalogue', () => {
  it('resolves every seeded task to a real suggestion, filed in an area', () => {
    for (const task of [...STARTER_FIXED, ...STARTER_ROTATION_POOL]) {
      expect(suggestionById(task.id), task.id).toBeDefined();
      expect(AREA_IDS, task.id).toContain(task.area);
    }
  });
});

describe('tailoredFor', () => {
  it('offers everything when no area is chosen, rather than nothing', () => {
    // An empty choice means "no preference", which is every area. An ideas
    // screen with nothing on it is worse than an unsorted one.
    expect(tailoredFor([], [])).toHaveLength(SUGGESTIONS.length);
  });

  it('never offers back something already adopted', () => {
    const owned = [goal({ suggestionId: 'body-water' })];
    const out = tailoredFor([], owned);
    expect(out.map((s) => s.id)).not.toContain('body-water');
    expect(out).toHaveLength(SUGGESTIONS.length - 1);
  });

  it('offers an archived goal again, because putting one away is not taking it', () => {
    const owned = [goal({ suggestionId: 'body-water', archivedAt: AT })];
    expect(tailoredFor([], owned).map((s) => s.id)).toContain('body-water');
  });

  it('counts a seeded daily as adopted, not just a goal', () => {
    // The starter plan seeds its eight as dailies carrying the same id. An
    // ideas screen that only looked at goals would offer "brush your teeth"
    // back to somebody the app planted it for ten seconds earlier.
    const owned = [goal({ type: 'daily', suggestionId: 'body-teeth' })];
    expect(tailoredFor([], owned).map((s) => s.id)).not.toContain('body-teeth');
  });

  it('narrows to the chosen areas', () => {
    for (const s of tailoredFor(['mind'], [])) expect(s.area).toBe('mind');
  });

  it('round-robins the chosen areas instead of concatenating them', () => {
    // Concatenating buries the last-chosen area below twenty entries nobody
    // scrolls to, which makes choosing three areas quietly the same as
    // choosing the first one.
    const out = tailoredFor(['body', 'mind', 'people'], []);
    expect(out.slice(0, 3).map((s) => s.area)).toEqual(['body', 'mind', 'people']);
    expect(out.slice(3, 6).map((s) => s.area)).toEqual(['body', 'mind', 'people']);
  });

  it('keeps going once a shorter area runs out', () => {
    const out = tailoredFor(['body', 'mind', 'people'], []);
    const expected = suggestionsFor('body').length
      + suggestionsFor('mind').length
      + suggestionsFor('people').length;
    expect(out).toHaveLength(expected);
    expect(new Set(out.map((s) => s.id)).size).toBe(expected);
  });

  it('ignores the order the areas were chosen in, so the list does not reshuffle', () => {
    const a = tailoredFor(['people', 'body'], []).map((s) => s.id);
    const b = tailoredFor(['body', 'people'], []).map((s) => s.id);
    expect(a).toEqual(b);
  });

  it('is a pure function of its inputs, because both phones derive it', () => {
    const owned = [goal({ suggestionId: 'space-plant' })];
    expect(tailoredFor(['space'], owned)).toEqual(tailoredFor(['space'], owned));
  });
});

describe('areaProgress', () => {
  const day = '2026-09-11';

  it('counts done against total within one area', () => {
    const goals = [
      goal({ id: 'a', area: 'body', lastCompletedOn: day }),
      goal({ id: 'b', area: 'body' }),
      goal({ id: 'c', area: 'mind', lastCompletedOn: day }),
    ];
    expect(areaProgress(goals, 'body', day)).toEqual({ done: 1, total: 2 });
    expect(areaProgress(goals, 'mind', day)).toEqual({ done: 1, total: 1 });
  });

  it('reads an empty area as nothing rather than dividing by zero', () => {
    expect(areaProgress([], 'purpose', day)).toEqual({ done: 0, total: 0 });
  });

  it('leaves archived goals out of both halves', () => {
    const goals = [goal({ id: 'a', area: 'body', archivedAt: AT, lastCompletedOn: day })];
    expect(areaProgress(goals, 'body', day)).toEqual({ done: 0, total: 0 });
  });

  it('does not count yesterday as done', () => {
    const goals = [goal({ id: 'a', area: 'body', lastCompletedOn: '2026-09-10' })];
    expect(areaProgress(goals, 'body', day)).toEqual({ done: 0, total: 1 });
  });
});
