import { hash } from '../hash';
import type { DayKey } from '../types';
import { purseById } from './coinSources';

/**
 * The reward wheel: push the button, it spins, it lands on something.
 *
 * Pure. The Dexie half is `spinWheel` in `db/repository/coinSources.ts`.
 *
 * **What is printed is what is rolled.** Each wedge shows its chance, and that
 * chance is computed from the very weights `rollWheel` walks -- there is no
 * second table to drift. The prizes are all coin purses (`coinSources.ts`),
 * which are found and never sold, so the wheel cannot be a way to turn coins
 * into more coins; `wheel.test.ts` also holds the average payout under a ceiling
 * so a tuned weight cannot quietly turn it into one.
 *
 * Rarer prize, smaller chance: the order of the wedges is the order of the
 * purses, and the weights only fall as the purse grows.
 *
 * **Two phones, one spin.** The roll is a function of the member and the
 * *source* (today's date, or the boss that was beaten), never of the clock or
 * `Math.random`, so a retry, or the same member on a second phone, lands on the
 * same wedge. The row the prize is stored in has an id made from the same
 * source, which is also what says "already spun".
 */

export interface WheelSegment {
  id: string;
  /** The purse it pays out; see `PURSES`. */
  purse: string;
  /** Integer, out of `WHEEL_TOTAL`. */
  weight: number;
}

export const WHEEL_SEGMENTS: readonly WheelSegment[] = [
  { id: 'pinch', purse: 'purse-pinch', weight: 45 },
  { id: 'small', purse: 'purse-small', weight: 32 },
  { id: 'fat', purse: 'purse-fat', weight: 15 },
  { id: 'hoard', purse: 'purse-hoard', weight: 7 },
  { id: 'jackpot', purse: 'purse-jackpot', weight: 1 },
];

export const WHEEL_TOTAL = WHEEL_SEGMENTS.reduce((sum, s) => sum + s.weight, 0);

/** The average payout of one spin, in coins. The test holds this under a ceiling. */
export function expectedCoins(): number {
  return WHEEL_SEGMENTS.reduce((sum, s) => sum + (purseById(s.purse)?.coins ?? 0) * s.weight, 0) / WHEEL_TOTAL;
}

export interface WheelOdds {
  segment: WheelSegment;
  coins: number;
  /** A whole-number percent. All of them add up to exactly 100. */
  percent: number;
}

/**
 * Whole-number percents that sum to exactly 100, by largest remainder: round
 * everything down, then give the leftover points to the biggest fractions.
 */
export function wheelOdds(): WheelOdds[] {
  const exact = WHEEL_SEGMENTS.map((s) => (s.weight / WHEEL_TOTAL) * 100);
  const percents = exact.map(Math.floor);
  let left = 100 - percents.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    percents[index] += 1;
    left -= 1;
  }
  return WHEEL_SEGMENTS.map((segment, i) => ({
    segment,
    coins: purseById(segment.purse)?.coins ?? 0,
    percent: percents[i],
  }));
}

/** Which wedge a number in [0, 1) lands on. The same walk the printed odds come from. */
export function rollWheel(roll: number): WheelSegment {
  let target = Math.min(Math.max(roll, 0), 0.999999999) * WHEEL_TOTAL;
  for (const segment of WHEEL_SEGMENTS) {
    if (target < segment.weight) return segment;
    target -= segment.weight;
  }
  return WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1];
}

/* -- sources ------------------------------------------------------------------ */

/** One free spin a day, in the member's own zone. */
export const dailySpinSource = (day: DayKey): string => `wheel-${day}`;

/** One bonus spin per boss beaten, so it can never be farmed. */
export const bossSpinSource = (monsterId: string): string => `wheel-boss-${monsterId}`;

/** A number in [0, 1) that is the same for the same member and source, on any phone. */
export function spinRoll(memberId: string, source: string): number {
  return hash(`${memberId}/${source}`) / 4294967296;
}

/** Where the wheel stops, turned into the angle (in degrees) it rests at for a segment's centre. */
export function restAngle(index: number, count = WHEEL_SEGMENTS.length): number {
  return ((index + 0.5) / count) * 360;
}
