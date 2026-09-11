import { describe, expect, it } from 'vitest';
import { MOVE_SETS, moveAt, moveSetById, setSeconds } from './movements';

describe('the movement sets', () => {
  it('repeats no id and no name', () => {
    expect(new Set(MOVE_SETS.map((s) => s.id)).size).toBe(MOVE_SETS.length);
    expect(new Set(MOVE_SETS.map((s) => s.name)).size).toBe(MOVE_SETS.length);
  });

  it('gives every move a real length and an instruction', () => {
    for (const set of MOVE_SETS) {
      expect(set.moves.length, set.id).toBeGreaterThanOrEqual(3);
      for (const move of set.moves) {
        expect(move.seconds, `${set.id}/${move.name}`).toBeGreaterThan(0);
        expect(move.how.trim().length, `${set.id}/${move.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every set short enough to just do', () => {
    // The whole premise is two minutes where you already are. A set that runs
    // ten minutes is a workout, and workouts have their own screen.
    for (const set of MOVE_SETS) {
      expect(setSeconds(set), set.id).toBeLessThanOrEqual(240);
    }
  });

  it('finds one by id', () => {
    expect(moveSetById('desk')?.name).toBe('Unstick');
    expect(moveSetById('nope')).toBeUndefined();
  });
});

describe('moveAt', () => {
  const set = MOVE_SETS[0];

  it('starts on the first move', () => {
    expect(moveAt(set, 0)?.index).toBe(0);
  });

  it('advances through the set on the clock', () => {
    const first = set.moves[0].seconds;
    expect(moveAt(set, first - 0.1)?.index).toBe(0);
    expect(moveAt(set, first + 0.1)?.index).toBe(1);
  });

  it('returns nothing once the set is finished', () => {
    expect(moveAt(set, setSeconds(set) + 1)).toBeNull();
  });

  it('counts down whole seconds, never to zero', () => {
    for (let t = 0; t < setSeconds(set); t += 0.5) {
      expect(moveAt(set, t)!.remaining, `t=${t}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('treats negative time as the start rather than throwing', () => {
    expect(moveAt(set, -3)?.index).toBe(0);
  });

  it('is a pure function of elapsed time, so a backgrounded tab cannot drift it', () => {
    expect(moveAt(set, 42)).toEqual(moveAt(set, 42));
  });
});
