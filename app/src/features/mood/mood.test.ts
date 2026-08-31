import { describe, expect, it } from 'vitest';
import {
  MOOD_MAX,
  MOOD_METERS,
  MOOD_MIN,
  clampMood,
  comparisonLine,
  longDay,
  meterFor,
  moodChanged,
  moodSummary,
  scaleWord,
  toneOf,
  valuesOf,
  widestGap,
} from './mood';
import type { MoodEntry } from '../../domain/types';

/**
 * Two rules on this screen break silently rather than loudly.
 *
 * The first is direction: joy and moody run opposite ways, so a scale word
 * taken from the wrong end tells someone they had a hard day when they said
 * the opposite. The second is the difference between a day nobody logged and a
 * day logged as middling — every sentence here has to hold that line, and the
 * dirty check has to hold it too, or opening the page quietly saves a 5.
 */

const CALM_DAY = { hunger: 3, joy: 8, moody: 2 };
const HARD_DAY = { hunger: 9, joy: 2, moody: 9 };
const NEARLY_CALM_DAY = { hunger: 4, joy: 8, moody: 3 };

const STORED: MoodEntry = {
  id: 'mood-1',
  memberId: 'member-a',
  day: '2026-09-25',
  hunger: 3,
  joy: 8,
  moody: 2,
  updatedAt: 1,
};

describe('MOOD_METERS', () => {
  it('gives every meter one word per point on the scale', () => {
    for (const meter of MOOD_METERS) {
      expect(meter.scale).toHaveLength(MOOD_MAX - MOOD_MIN + 1);
    }
  });

  it('covers exactly the three keys a stored row carries', () => {
    expect(MOOD_METERS.map((m) => m.key)).toEqual(['hunger', 'joy', 'moody']);
  });
});

describe('scaleWord', () => {
  it('reads joy as better the higher it goes', () => {
    expect(scaleWord('joy', 1)).toBe('Flat');
    expect(scaleWord('joy', 10)).toBe('Radiant');
  });

  it('reads moody as harder the higher it goes', () => {
    expect(scaleWord('moody', 1)).toBe('Even');
    expect(scaleWord('moody', 10)).toBe('Stormy');
  });

  it('reads hunger as emptier the higher it goes', () => {
    expect(scaleWord('hunger', 1)).toBe('Stuffed');
    expect(scaleWord('hunger', 10)).toBe('Ravenous');
  });

  it('has a distinct word for every point of every meter', () => {
    for (const meter of MOOD_METERS) {
      expect(new Set(meter.scale).size).toBe(meter.scale.length);
    }
  });
});

describe('clampMood', () => {
  it('leaves a value inside the scale alone', () => {
    expect(clampMood(7)).toBe(7);
  });

  it('pulls a value from outside the scale back to the nearest end', () => {
    expect(clampMood(0)).toBe(MOOD_MIN);
    expect(clampMood(-4)).toBe(MOOD_MIN);
    expect(clampMood(11)).toBe(MOOD_MAX);
  });

  it('rounds a fractional value rather than indexing between two words', () => {
    expect(clampMood(6.4)).toBe(6);
    expect(scaleWord('joy', 6.4)).toBe('Warm');
  });

  it('lands a missing number in the middle instead of throwing', () => {
    expect(clampMood(Number.NaN)).toBe(5);
  });
});

describe('longDay', () => {
  it('names the day without letting the device pick the words', () => {
    expect(longDay('2026-08-31')).toBe('Monday 31 August');
  });

  it('reads a day key as a calendar date rather than an instant', () => {
    // Parsed as UTC on purpose: read as local time, a phone west of Greenwich
    // would render the day before.
    expect(longDay('2026-01-01')).toBe('Thursday 1 January');
  });
});

describe('meterFor', () => {
  it('throws on a key that is not a meter', () => {
    // @ts-expect-error the guard exists for rows that arrive from elsewhere.
    expect(() => meterFor('sleepy')).toThrow();
  });
});

describe('valuesOf', () => {
  it('reads the three numbers off a stored row', () => {
    expect(valuesOf(STORED)).toEqual(CALM_DAY);
  });

  it('says nothing rather than a neutral day when there is no row', () => {
    expect(valuesOf(undefined)).toBeNull();
    expect(valuesOf(null)).toBeNull();
  });
});

describe('toneOf', () => {
  it('names the day by its joy and its evenness', () => {
    expect(toneOf(CALM_DAY)).toBe('bright, and settled');
  });
});

describe('moodSummary', () => {
  it('reads both columns when both are logged', () => {
    expect(moodSummary(CALM_DAY, HARD_DAY, { partnerName: 'Ada' })).toBe(
      'You are bright, and settled. Ada is low, and frayed.',
    );
  });

  it('does not invent a partner before there is one', () => {
    expect(moodSummary(CALM_DAY, null, { paired: false })).toBe(
      'You are bright, and settled today.',
    );
  });

  it('says the partner is still to log once there is a partner', () => {
    expect(moodSummary(CALM_DAY, null, { paired: true, partnerName: 'Ada' })).toBe(
      'You are bright, and settled. Ada has not logged today yet.',
    );
  });

  it('leaves your own empty day open rather than judged', () => {
    expect(moodSummary(null, HARD_DAY, { partnerName: 'Ada' })).toBe(
      'Ada is low, and frayed. Your side of today is still open.',
    );
  });

  it('waits rather than nags when nobody has logged', () => {
    expect(moodSummary(null, null, { paired: false })).toBe(
      'Nothing logged today. Whenever you are ready.',
    );
    expect(moodSummary(null, null, { paired: true })).toBe(
      'Nothing logged today. Whenever either of you is ready.',
    );
  });

  it('falls back to a neutral name when the partner has none yet', () => {
    expect(moodSummary(null, HARD_DAY)).toContain('Your partner is');
  });

  it('ignores a partner name that is only whitespace', () => {
    expect(moodSummary(null, HARD_DAY, { partnerName: '   ' })).toContain('Your partner is');
  });

  it('infers a partner from their row when pairing is not stated', () => {
    expect(moodSummary(CALM_DAY, null)).toBe('You are bright, and settled today.');
  });
});

describe('widestGap', () => {
  it('finds the meter the two of you disagree on most', () => {
    expect(widestGap(CALM_DAY, HARD_DAY)).toEqual({ key: 'moody', distance: 7 });
  });

  it('breaks a tie in the order the columns are drawn', () => {
    const gap = widestGap({ hunger: 1, joy: 1, moody: 1 }, { hunger: 5, joy: 5, moody: 5 });
    expect(gap).toEqual({ key: 'hunger', distance: 4 });
  });

  it('has nothing to compare when one side has not logged', () => {
    expect(widestGap(CALM_DAY, null)).toBeNull();
    expect(widestGap(null, HARD_DAY)).toBeNull();
  });
});

describe('comparisonLine', () => {
  it('names the widest gap in points', () => {
    expect(comparisonLine(CALM_DAY, HARD_DAY)).toBe(
      'Furthest apart on moody, 7 points between you.',
    );
  });

  it('calls a day within one point on every meter a match', () => {
    expect(comparisonLine(CALM_DAY, NEARLY_CALM_DAY)).toBe(
      'Within a point of each other on all three today.',
    );
  });

  it('says nothing at all with only one column to read', () => {
    expect(comparisonLine(CALM_DAY, null)).toBeNull();
  });
});

describe('moodChanged', () => {
  it('is false on a screen nobody has touched', () => {
    expect(moodChanged(STORED, null, null)).toBe(false);
    expect(moodChanged(undefined, null, null)).toBe(false);
  });

  it('is true once a slider moves off the stored value', () => {
    expect(moodChanged(STORED, { ...CALM_DAY, joy: 9 }, null)).toBe(true);
  });

  it('is false when a slider is moved back to where it started', () => {
    expect(moodChanged(STORED, CALM_DAY, null)).toBe(false);
  });

  it('is true for any draft at all when the day has no row yet', () => {
    expect(moodChanged(undefined, { hunger: 5, joy: 5, moody: 5 }, null)).toBe(true);
  });

  it('is true once the note is edited', () => {
    expect(moodChanged(STORED, null, 'slept badly')).toBe(true);
  });

  it('ignores whitespace either side of an unchanged note', () => {
    expect(moodChanged({ ...STORED, note: 'slept badly' }, null, '  slept badly  ')).toBe(false);
  });

  it('is true when a note is cleared away', () => {
    expect(moodChanged({ ...STORED, note: 'slept badly' }, null, '')).toBe(true);
  });
});
