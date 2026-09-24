import { addDays } from '../../domain/day';
import type { DayKey, MoodEntry } from '../../domain/types';
import { MOOD_METERS, clampMood, scaleWord, type MoodKey } from './mood';

/**
 * The last week or month of the three meters, for both of you.
 *
 * Everything here is a read over rows both phones already hold — the entries
 * sync carries every mood row to the partner, and nothing is ever discarded —
 * so a trend needs no new table, no new sync kind and no server.
 *
 * The rule from `mood.ts` carries over unchanged: a day nobody logged is
 * `null`, never a neutral 5. An average is over logged days only, and a
 * person with no logged days has no average rather than a middling one.
 */

export type TrendSpan = 7 | 30;
export const TREND_SPANS: readonly TrendSpan[] = [7, 30];

/** A joy of 3 is "Muted"; at or below it, a day reads as a low one. */
export const LOW_JOY = 3;

export interface MeterTrend {
  key: MoodKey;
  /** One slot per day in `MoodTrend.days`, null where that person did not log. */
  mine: (number | null)[];
  theirs: (number | null)[];
  /** One decimal place, over logged days only. Null with nothing logged. */
  mineAverage: number | null;
  theirAverage: number | null;
}

export interface MoodTrend {
  /** Oldest first, ending on today. */
  days: DayKey[];
  meters: MeterTrend[];
  mineLogged: number;
  theirLogged: number;
}

/** The `span` days ending on `today`, oldest first. */
export function trendDays(today: DayKey, span: TrendSpan): DayKey[] {
  return Array.from({ length: span }, (_, i) => addDays(today, i - span + 1));
}

/**
 * Keyed by day, keeping the latest write if a day somehow holds two rows for
 * the same side — the same answer on both phones, whatever order they arrived.
 */
function byDay(rows: readonly MoodEntry[]): Map<DayKey, MoodEntry> {
  const out = new Map<DayKey, MoodEntry>();
  for (const row of rows) {
    const held = out.get(row.day);
    if (!held || row.updatedAt > held.updatedAt) out.set(row.day, row);
  }
  return out;
}

function average(values: readonly (number | null)[]): number | null {
  const logged = values.filter((v): v is number => v !== null);
  if (logged.length === 0) return null;
  return Math.round((logged.reduce((a, b) => a + b, 0) / logged.length) * 10) / 10;
}

/**
 * `rows` may be any superset of the window: days outside it are ignored. The
 * partner is every row that is not mine, the same reading `MoodPage` uses.
 */
export function moodTrend(
  rows: readonly MoodEntry[],
  memberId: string | null,
  today: DayKey,
  span: TrendSpan,
): MoodTrend {
  const days = trendDays(today, span);
  const mine = byDay(rows.filter((r) => r.memberId === memberId));
  const theirs = byDay(rows.filter((r) => r.memberId !== memberId));

  const meters = MOOD_METERS.map(({ key }): MeterTrend => {
    const read = (side: Map<DayKey, MoodEntry>) =>
      days.map((day) => {
        const row = side.get(day);
        return row ? clampMood(row[key]) : null;
      });
    const m = read(mine);
    const t = read(theirs);
    return { key, mine: m, theirs: t, mineAverage: average(m), theirAverage: average(t) };
  });

  return {
    days,
    meters,
    mineLogged: days.filter((d) => mine.has(d)).length,
    theirLogged: days.filter((d) => theirs.has(d)).length,
  };
}

/** Days in the window where both of you logged a joy at or below `LOW_JOY`. */
export function sharedLowDays(trend: MoodTrend): number {
  const joy = trend.meters.find((m) => m.key === 'joy');
  if (!joy) return 0;
  return joy.mine.filter((v, i) => v !== null && v <= LOW_JOY && (joy.theirs[i] ?? Infinity) <= LOW_JOY).length;
}

function side(who: string, logged: number, span: number, joy: number | null): string {
  if (joy === null) return `${who} logged none of the last ${span} days.`;
  return `${who} logged ${logged} of the last ${span} days, joy mostly ${scaleWord('joy', joy).toLowerCase()}.`;
}

/**
 * The sentence above the charts. Like the rest of the Mood screen it counts
 * what was logged and never what was missed: "logged 3 of 7", not "missed 4".
 */
export function trendSummary(trend: MoodTrend, partnerName: string, paired: boolean): string {
  const span = trend.days.length;
  if (trend.mineLogged === 0 && trend.theirLogged === 0) {
    return `Nothing logged in the last ${span} days yet. The lines draw themselves as days go down.`;
  }
  const joy = trend.meters.find((m) => m.key === 'joy');
  const mine = side('You', trend.mineLogged, span, joy?.mineAverage ?? null);
  if (!paired && trend.theirLogged === 0) return mine;
  return `${mine} ${side(partnerName, trend.theirLogged, span, joy?.theirAverage ?? null)}`;
}

/** The quieter second line, only when there is something shared to say. */
export function sharedLowLine(trend: MoodTrend): string | null {
  const days = sharedLowDays(trend);
  if (days < 2) return null;
  return `You were both low on joy on ${days} of these days. Might be worth a slow evening together.`;
}
