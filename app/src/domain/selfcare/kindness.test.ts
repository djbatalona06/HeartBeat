import { describe, expect, it } from 'vitest';
import { ACTS, actById, actForDay, actsFor } from './kindness';

describe('the acts', () => {
  it('repeats no id and no text', () => {
    expect(new Set(ACTS.map((a) => a.id)).size).toBe(ACTS.length);
    expect(new Set(ACTS.map((a) => a.text)).size).toBe(ACTS.length);
  });

  it('sorts every act into one of the two groups, with enough in each', () => {
    expect(actsFor('them').length).toBeGreaterThanOrEqual(5);
    expect(actsFor('anyone').length).toBeGreaterThanOrEqual(5);
    expect(actsFor('them').length + actsFor('anyone').length).toBe(ACTS.length);
  });

  it('finds one by id', () => {
    expect(actById('them-chore')).toBeDefined();
    expect(actById('nope')).toBeUndefined();
    expect(actById(undefined)).toBeUndefined();
  });
});

describe('actForDay', () => {
  it('gives the same day the same suggestion', () => {
    // Reopening the screen must not reshuffle the thing you were about to go
    // and do — the same rule the starter rotation and the prompt follow.
    expect(actForDay('2026-09-11', 'them')).toEqual(actForDay('2026-09-11', 'them'));
  });

  it('only ever suggests from the group asked for', () => {
    for (const day of ['2026-09-11', '2026-09-12', '2026-01-01', '2026-12-31']) {
      expect(actForDay(day, 'them').who).toBe('them');
      expect(actForDay(day, 'anyone').who).toBe('anyone');
    }
  });

  it('moves on across a week', () => {
    const ids = new Set(
      ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14']
        .map((d) => actForDay(d, 'anyone').id),
    );
    expect(ids.size).toBeGreaterThan(1);
  });
});
