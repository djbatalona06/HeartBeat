import { describe, expect, it } from 'vitest';
import { ROUTINES, SIGNPOST, routineById } from './firstAid';

describe('the routines', () => {
  it('repeats no id and no name', () => {
    expect(new Set(ROUTINES.map((r) => r.id)).size).toBe(ROUTINES.length);
    expect(new Set(ROUTINES.map((r) => r.name)).size).toBe(ROUTINES.length);
  });

  it('tells you when to reach for each one', () => {
    for (const routine of ROUTINES) {
      expect(routine.when.trim().length, routine.id).toBeGreaterThan(0);
      expect(routine.steps.length, routine.id).toBeGreaterThanOrEqual(3);
      for (const step of routine.steps) {
        expect(step.title.trim().length, `${routine.id}/${step.title}`).toBeGreaterThan(0);
        expect(step.body.trim().length, `${routine.id}/${step.title}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every step short enough to read with shaking hands', () => {
    for (const routine of ROUTINES) {
      for (const step of routine.steps) {
        expect(step.title.length, `${routine.id}/${step.title}`).toBeLessThanOrEqual(48);
      }
    }
  });

  it('finds one by id', () => {
    expect(routineById('ground')?.name).toBe('Come back to the room');
    expect(routineById('nope')).toBeUndefined();
  });
});

describe('the signpost', () => {
  /**
   * Numbers differ by country, they change, and a wrong one in a moment like
   * this is worse than none — so this names what to search for instead of
   * hardcoding a number that will be wrong for most readers.
   */
  it('carries no hardcoded phone number', () => {
    expect(SIGNPOST.body).not.toMatch(/\b\d{3}[\s.-]?\d{3,4}\b/);
    expect(SIGNPOST.body).not.toMatch(/\b(?:988|911|999|112|116123)\b/);
  });

  it('points at a real person rather than at the app', () => {
    expect(SIGNPOST.body.toLowerCase()).toMatch(/crisis line|emergency|doctor/);
  });
});
