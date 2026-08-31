import { describe, expect, it } from 'vitest';
import {
  blankRow, cleanCaption, formatVolume, isWorthSaving, parseNumber, repsOf, rowHasContent,
  summarise, toRows, toSets, volumeOf, type SetRow,
} from './workout';

/**
 * The grid is where a workout becomes data, and every rule it applies is one
 * you only notice when it is wrong: a bodyweight set that silently becomes zero
 * kilograms, a blank row saved as an exercise called nothing, a total that
 * counts a comma-typed weight as a thousand. These pin all of it.
 */

const ROW = (over: Partial<SetRow> = {}): SetRow => ({
  id: 'row-1', name: 'Squat', reps: '5', weight: '60', ...over,
});

const A_FULL_DAY: SetRow[] = [
  { id: 'a', name: 'Squat', reps: '5', weight: '100' },
  { id: 'b', name: 'Pull-up', reps: '8', weight: '' },
  { id: 'c', name: 'Bench', reps: '5', weight: '80' },
];

describe('parseNumber', () => {
  it('reads a plain number', () => {
    expect(parseNumber('12', 999)).toBe(12);
  });

  it('reads a decimal typed with a comma, as half the world types it', () => {
    expect(parseNumber('62,5', 999)).toBe(62.5);
  });

  it('treats a blank, a stray minus and a word as nothing yet', () => {
    expect(parseNumber('', 999)).toBeUndefined();
    expect(parseNumber('   ', 999)).toBeUndefined();
    expect(parseNumber('-5', 999)).toBeUndefined();
    expect(parseNumber('heavy', 999)).toBeUndefined();
  });

  it('treats zero as nothing rather than as a value', () => {
    expect(parseNumber('0', 999)).toBeUndefined();
  });

  it('caps a typo at the maximum instead of letting it skew the total', () => {
    expect(parseNumber('99999', 999)).toBe(999);
  });

  it('keeps two decimals and no more', () => {
    expect(parseNumber('62.456', 999)).toBe(62.46);
  });
});

describe('rowHasContent', () => {
  it('is true once the exercise is named', () => {
    expect(rowHasContent(ROW({ reps: '', weight: '' }))).toBe(true);
  });

  it('is false for a row that is only whitespace', () => {
    expect(rowHasContent(ROW({ name: '   ' }))).toBe(false);
  });

  it('is false for a fresh row', () => {
    expect(rowHasContent(blankRow('x'))).toBe(false);
  });
});

describe('toSets', () => {
  it('drops rows that never got a name', () => {
    const sets = toSets([ROW(), blankRow('empty'), ROW({ id: 'b', name: '  ', reps: '9' })]);
    expect(sets).toHaveLength(1);
    expect(sets[0].name).toBe('Squat');
  });

  it('leaves a bodyweight set without a weight rather than calling it zero', () => {
    const sets = toSets([ROW({ name: 'Pull-up', weight: '' })]);
    expect(sets[0]).toEqual({ name: 'Pull-up', reps: 5 });
    expect('weightKg' in sets[0]).toBe(false);
  });

  it('keeps a named row whose reps are still blank', () => {
    const sets = toSets([ROW({ name: 'Plank', reps: '', weight: '' })]);
    expect(sets).toEqual([{ name: 'Plank', reps: 0 }]);
  });

  it('trims the name', () => {
    expect(toSets([ROW({ name: '  Deadlift  ' })])[0].name).toBe('Deadlift');
  });
});

describe('toRows', () => {
  it('round-trips a stored day back into editable rows', () => {
    const rows = toRows(toSets(A_FULL_DAY), ['a', 'b', 'c']);
    expect(rows).toEqual(A_FULL_DAY);
  });

  it('gives every row an id, so React keys stay stable while typing', () => {
    const rows = toRows([{ name: 'Row', reps: 10, weightKg: 40 }]);
    expect(rows[0].id).toBeTruthy();
  });

  it('handles a day with no entry at all', () => {
    expect(toRows(undefined)).toEqual([]);
  });
});

describe('volumeOf', () => {
  it('multiplies reps by weight and sums', () => {
    expect(volumeOf(toSets(A_FULL_DAY))).toBe(5 * 100 + 5 * 80);
  });

  it('counts a bodyweight set as no volume, which is why reps show too', () => {
    expect(volumeOf([{ name: 'Pull-up', reps: 8 }])).toBe(0);
    expect(repsOf([{ name: 'Pull-up', reps: 8 }])).toBe(8);
  });
});

describe('formatVolume', () => {
  it('groups thousands, because five bare digits are unreadable', () => {
    expect(formatVolume(12400)).toBe('12,400 kg');
  });
});

describe('summarise', () => {
  it('says nothing has happened when nothing has', () => {
    expect(summarise([])).toBe('Nothing logged yet.');
  });

  it('counts sets, reps and volume', () => {
    expect(summarise(toSets(A_FULL_DAY))).toBe('3 sets · 18 reps · 900 kg');
  });

  it('stays singular for one of a thing', () => {
    expect(summarise([{ name: 'Squat', reps: 1, weightKg: 60 }])).toBe('1 set · 1 rep · 60 kg');
  });

  it('leaves volume out of a bodyweight day rather than printing 0 kg', () => {
    expect(summarise([{ name: 'Pull-up', reps: 8 }])).toBe('1 set · 8 reps');
  });
});

describe('cleanCaption', () => {
  it('trims', () => {
    expect(cleanCaption('  legs day  ')).toBe('legs day');
  });

  it('reads a blank caption as absent, not as an empty string', () => {
    expect(cleanCaption('   ')).toBeUndefined();
  });

  it('caps a caption that ran away', () => {
    expect(cleanCaption('a'.repeat(500))?.length).toBe(140);
  });
});

describe('isWorthSaving', () => {
  it('is false for an untouched grid', () => {
    expect(isWorthSaving([blankRow('a')], '')).toBe(false);
  });

  it('is true once a row is named', () => {
    expect(isWorthSaving([ROW()], '')).toBe(true);
  });

  it('is true for a caption on its own — a rest day is worth writing down', () => {
    expect(isWorthSaving([blankRow('a')], 'rest day, walked the dog')).toBe(true);
  });
});
