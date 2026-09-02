import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, TIER_PAYOUT, achievementByCode } from './catalogue';
import {
  NO_PROGRESS,
  countGear,
  isEarned,
  newlyEarned,
  nextUp,
  payoutFor,
  progressOf,
  SUGGESTIONS,
  shelfRows,
  stateFrom,
  unlock,
} from './unlock';

const at = (over: Partial<typeof NO_PROGRESS>) => ({ ...NO_PROGRESS, ...over });

describe('NO_PROGRESS', () => {
  it('starts every counter at zero, not undefined', () => {
    for (const value of Object.values(NO_PROGRESS)) expect(value).toBe(0);
  });

  it('earns nothing — a fresh couple has an empty shelf', () => {
    expect(unlock(NO_PROGRESS)).toEqual([]);
  });
});

describe('stateFrom', () => {
  it('takes the best streak on one task, not the sum across tasks', () => {
    // "Ten in a row" has to mean ten on one thing. Summing would hand it to
    // someone who did ten different things once each.
    const state = stateFrom({ tasks: [{ streak: 4 }, { streak: 9 }, { streak: 2 }] });
    expect(state.bestStreak).toBe(9);
  });

  it('survives tasks with no streak recorded', () => {
    expect(stateFrom({ tasks: [{}, { streak: 3 }] }).bestStreak).toBe(3);
    expect(stateFrom({ tasks: [] }).bestStreak).toBe(0);
  });

  it('counts a task as finished once it carries a completion date', () => {
    const state = stateFrom({
      tasks: [{ lastCompletedOn: '2026-03-01' }, { streak: 2 }, { lastCompletedOn: '2026-03-02' }],
    });
    expect(state.tasksFinished).toBe(2);
  });

  it('counts a task once however many times it has been completed', () => {
    // A daily held for a year is one finished task. `bestStreak` is what
    // recognises the holding.
    const state = stateFrom({ tasks: [{ lastCompletedOn: '2026-03-01', streak: 365 }] });
    expect(state.tasksFinished).toBe(1);
    expect(state.bestStreak).toBe(365);
  });

  it('defaults every counter it was not given', () => {
    expect(stateFrom({})).toEqual(NO_PROGRESS);
  });
});

describe('countGear', () => {
  it('counts filled slots', () => {
    expect(countGear({ helmet: 'h1', boots: 'b1' })).toBe(2);
  });

  it('does not count an absent or empty slot', () => {
    expect(countGear({ helmet: 'h1', boots: undefined, amulet: '' })).toBe(1);
    expect(countGear(undefined)).toBe(0);
    expect(countGear({})).toBe(0);
  });
});

describe('unlock', () => {
  it('takes a rung the moment its count is reached', () => {
    const def = achievementByCode('mood.1')!;
    expect(isEarned(def, at({ moodDays: def.need - 1 }))).toBe(false);
    expect(isEarned(def, at({ moodDays: def.need }))).toBe(true);
  });

  it('takes every rung below the one reached, not only the highest', () => {
    const third = achievementByCode('mood.3')!;
    const codes = unlock(at({ moodDays: third.need }));
    expect(codes).toContain('mood.1');
    expect(codes).toContain('mood.2');
    expect(codes).toContain('mood.3');
  });

  it('leaves other tracks alone', () => {
    const codes = unlock(at({ moodDays: 999 }));
    expect(codes.every((c) => c.startsWith('mood.'))).toBe(true);
  });

  it('gives everything to a state past every rung', () => {
    const everything = Object.fromEntries(
      Object.keys(NO_PROGRESS).map((k) => [k, 100_000]),
    ) as typeof NO_PROGRESS;
    expect(unlock(everything)).toHaveLength(ACHIEVEMENTS.length);
  });
});

describe('newlyEarned', () => {
  it('is what has been reached and not yet recorded', () => {
    const state = at({ moodDays: 15 });
    expect(newlyEarned(state, []).map((d) => d.code)).toEqual(['mood.1', 'mood.2']);
  });

  /**
   * The bug this whole shape exists to prevent. Evaluating twice must pay
   * once — otherwise every live-query tick that fires while a write is in
   * flight hands out the same XP again.
   */
  it('is empty the second time, given what the first time recorded', () => {
    const state = at({ moodDays: 15 });
    const first = newlyEarned(state, []);
    expect(first).not.toHaveLength(0);
    const second = newlyEarned(state, first.map((d) => d.code));
    expect(second).toEqual([]);
  });

  it('pays nothing more when the counter keeps climbing below the next rung', () => {
    const already = newlyEarned(at({ moodDays: 15 }), []).map((d) => d.code);
    expect(newlyEarned(at({ moodDays: 40 }), already)).toEqual([]);
  });

  it('ignores a recorded code that is no longer in the catalogue', () => {
    // A renamed track leaves rows behind. They must not crash the claim, and
    // must not block a code that is still real.
    const fresh = newlyEarned(at({ moodDays: 1 }), ['retired.7']);
    expect(fresh.map((d) => d.code)).toEqual(['mood.1']);
  });
});

describe('payoutFor', () => {
  it('adds up what a claim is worth', () => {
    const defs = newlyEarned(at({ moodDays: 15 }), []);
    expect(payoutFor(defs)).toBe(TIER_PAYOUT[1] + TIER_PAYOUT[2]);
  });

  it('is nothing when nothing was earned', () => {
    expect(payoutFor([])).toBe(0);
  });
});

describe('progressOf', () => {
  it('reports how far along a rung is', () => {
    const def = achievementByCode('exercise.2')!;
    const p = progressOf(def, at({ exerciseDays: Math.floor(def.need / 2) }));
    expect(p.fraction).toBeGreaterThan(0.4);
    expect(p.fraction).toBeLessThan(0.6);
    expect(p.earned).toBe(false);
  });

  it('clamps a finished rung to a full bar', () => {
    const def = achievementByCode('exercise.1')!;
    const p = progressOf(def, at({ exerciseDays: 10_000 }));
    expect(p.fraction).toBe(1);
    expect(p.earned).toBe(true);
  });
});

describe('nextUp', () => {
  it('shows one rung per track', () => {
    const rows = nextUp(NO_PROGRESS);
    expect(new Set(rows.map((r) => r.def.track)).size).toBe(rows.length);
  });

  it('starts every track at its first rung', () => {
    for (const row of nextUp(NO_PROGRESS)) expect(row.def.tier).toBe(1);
  });

  it('moves a track on once its rung is earned', () => {
    const rows = nextUp(at({ moodDays: 1 }));
    expect(rows.find((r) => r.def.track === 'mood')!.def.code).toBe('mood.2');
  });

  it('keeps a finished track on its last rung rather than dropping it', () => {
    // A track that vanished when completed would make the shelf shrink as the
    // couple did more, which is exactly backwards.
    const rows = nextUp(at({ moodDays: 100_000 }));
    const mood = rows.find((r) => r.def.track === 'mood')!;
    expect(mood.def.code).toBe('mood.3');
    expect(mood.earned).toBe(true);
  });

  it('covers every track in the catalogue', () => {
    const all = new Set(ACHIEVEMENTS.map((a) => a.track));
    expect(new Set(nextUp(NO_PROGRESS).map((r) => r.def.track))).toEqual(all);
  });
});

describe('shelfRows', () => {
  it('offers a few things and not a dozen to a couple who just paired', () => {
    // The wall-of-locked-doors check. Twelve empty bars is a backlog.
    const rows = shelfRows(NO_PROGRESS);
    expect(rows).toHaveLength(SUGGESTIONS);
    expect(rows.every((r) => r.have === 0)).toBe(true);
  });

  it('shows everything under way, and does not drop one for the cap', () => {
    const state = at({ moodDays: 2, exerciseDays: 1, events: 3, notes: 1, pets: 1 });
    const rows = shelfRows(state);
    const moving = rows.filter((r) => r.have > 0).map((r) => r.def.track);
    expect(moving).toEqual(expect.arrayContaining(['mood', 'exercise', 'calendar', 'notes', 'pets']));
  });

  it('grows as the couple do more rather than starting full', () => {
    const empty = shelfRows(NO_PROGRESS).length;
    const busy = shelfRows(at({ moodDays: 2, exerciseDays: 1, events: 3 })).length;
    expect(busy).toBeGreaterThan(empty);
  });

  it('keeps a finished track on the shelf', () => {
    const rows = shelfRows(at({ moodDays: 100_000 }));
    const mood = rows.find((r) => r.def.track === 'mood');
    expect(mood?.earned).toBe(true);
  });

  it('shows every track once everything is under way', () => {
    const everything = Object.fromEntries(
      Object.keys(NO_PROGRESS).map((k) => [k, 1]),
    ) as typeof NO_PROGRESS;
    expect(shelfRows(everything)).toHaveLength(nextUp(everything).length);
  });

  it('offers nothing extra when asked for none', () => {
    expect(shelfRows(NO_PROGRESS, 0)).toEqual([]);
  });
});
