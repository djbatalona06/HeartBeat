import { describe, expect, it } from 'vitest';
import type { MoodEntry } from '../../domain/types';
import { moodTrend, sharedLowDays, sharedLowLine, trendDays, trendSummary } from './trends';

/**
 * The trend view has one rule worth breaking a test over: an unlogged day is a
 * gap, not a 5. An average that quietly counted empty days as middling would
 * tell a couple who logged two good days that their week was average.
 */

const TODAY = '2026-09-24';
let seq = 0;

function row(memberId: string, day: string, joy: number, extra: Partial<MoodEntry> = {}): MoodEntry {
  seq += 1;
  return { id: `m-${seq}`, memberId, day, hunger: 5, joy, moody: 3, updatedAt: seq, ...extra };
}

describe('trendDays', () => {
  it('ends on today, oldest first, across a month boundary', () => {
    expect(trendDays('2026-10-02', 7)).toEqual([
      '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
    ]);
    expect(trendDays(TODAY, 30)).toHaveLength(30);
  });
});

describe('moodTrend', () => {
  it('leaves unlogged days null and averages logged days only', () => {
    const trend = moodTrend([row('a', TODAY, 8), row('a', '2026-09-20', 6)], 'a', TODAY, 7);
    const joy = trend.meters.find((m) => m.key === 'joy')!;
    expect(joy.mine.filter((v) => v === null)).toHaveLength(5);
    expect(joy.mineAverage).toBe(7);
    expect(joy.theirAverage).toBeNull();
    expect(trend.mineLogged).toBe(2);
  });

  it('splits sides by member and ignores rows outside the window', () => {
    const trend = moodTrend(
      [row('a', TODAY, 8), row('b', TODAY, 2), row('b', '2026-08-01', 10)],
      'a', TODAY, 7,
    );
    const joy = trend.meters.find((m) => m.key === 'joy')!;
    expect(joy.mine.at(-1)).toBe(8);
    expect(joy.theirs.at(-1)).toBe(2);
    expect(trend.theirLogged).toBe(1);
  });

  it('keeps the latest write when a day holds two rows for one side', () => {
    const trend = moodTrend(
      [row('a', TODAY, 9, { updatedAt: 200 }), row('a', TODAY, 1, { updatedAt: 100 })],
      'a', TODAY, 7,
    );
    expect(trend.meters.find((m) => m.key === 'joy')!.mine.at(-1)).toBe(9);
  });

  it('clamps a malformed synced value rather than drawing off the chart', () => {
    const trend = moodTrend([row('a', TODAY, 42)], 'a', TODAY, 7);
    expect(trend.meters.find((m) => m.key === 'joy')!.mine.at(-1)).toBe(10);
  });

  it('rounds averages to one decimal place', () => {
    const trend = moodTrend(
      [row('a', TODAY, 7), row('a', '2026-09-23', 7), row('a', '2026-09-22', 6)],
      'a', TODAY, 7,
    );
    expect(trend.meters.find((m) => m.key === 'joy')!.mineAverage).toBe(6.7);
  });
});

describe('sharedLowDays', () => {
  it('counts only days both of you logged low joy', () => {
    const trend = moodTrend(
      [
        row('a', TODAY, 2), row('b', TODAY, 3),               // both low
        row('a', '2026-09-23', 2), row('b', '2026-09-23', 8), // only one low
        row('a', '2026-09-22', 1),                            // partner did not log
        row('a', '2026-09-21', 3), row('b', '2026-09-21', 1), // both low
      ],
      'a', TODAY, 7,
    );
    expect(sharedLowDays(trend)).toBe(2);
    expect(sharedLowLine(trend)).toMatch(/both low on joy on 2/);
  });

  it('says nothing about a single low day', () => {
    const trend = moodTrend([row('a', TODAY, 2), row('b', TODAY, 2)], 'a', TODAY, 7);
    expect(sharedLowLine(trend)).toBeNull();
  });
});

describe('trendSummary', () => {
  it('admits an empty window instead of inventing a week', () => {
    expect(trendSummary(moodTrend([], 'a', TODAY, 7), 'Sam', true)).toMatch(/^Nothing logged in the last 7 days/);
  });

  it('counts what was logged, never what was missed', () => {
    const trend = moodTrend([row('a', TODAY, 8), row('b', TODAY, 4)], 'a', TODAY, 7);
    const line = trendSummary(trend, 'Sam', true);
    expect(line).toBe('You logged 1 of the last 7 days, joy mostly bright. Sam logged 1 of the last 7 days, joy mostly okay.');
    expect(line).not.toMatch(/miss/i);
  });

  it('leaves the partner out before pairing', () => {
    const trend = moodTrend([row('a', TODAY, 8)], 'a', TODAY, 7);
    expect(trendSummary(trend, 'Sam', false)).toBe('You logged 1 of the last 7 days, joy mostly bright.');
  });
});
