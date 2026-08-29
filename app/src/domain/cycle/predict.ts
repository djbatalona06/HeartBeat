/**
 * Cycle prediction.
 *
 * Written from the published method rather than ported from anyone's code:
 * a median cycle length, a median absolute deviation for the spread, and a
 * luteal-anchored estimate when there is ovulation evidence to anchor to. See
 * NOTICE.md for the prior art this was informed by.
 *
 * Everything here is a pure function over sorted day keys, so the screen can
 * call it on every render and the tests can drive it without a database.
 *
 * Nothing in this file is contraception. A fertile window is an estimate with
 * a stated error bar, and the error bar is the honest part.
 */

import { addDays, daysBetween } from '../day';
import type { CycleEntry, DayKey } from '../types';

/** Cycles outside this range are data-entry noise, not biology, and are excluded. */
export const MIN_CYCLE_DAYS = 15;
export const MAX_CYCLE_DAYS = 90;

/** How many recent cycles feed the averages. Older ones describe a different body. */
export const HISTORY_WINDOW = 6;

/** Absent evidence, the luteal phase is the part of the cycle that varies least. */
export const DEFAULT_LUTEAL_DAYS = 14;

/**
 * The uncertainty band, in days either side.
 *
 * The clamp is the point of this whole function. Two cycles of history can
 * produce a median with zero deviation, and reporting "your period starts
 * Tuesday" from that is a lie told with a straight face — so the floor is two
 * days however clean the data looks. The ceiling stops a single mistyped date
 * widening the band until it means nothing.
 */
export const MIN_UNCERTAINTY_DAYS = 2;
export const MAX_UNCERTAINTY_DAYS = 9;

/** Past this, the history describes someone's last year, not their next week. */
export const STALE_HISTORY_DAYS = 90;

/** Sperm survive to about five days; the egg about one. */
const FERTILE_DAYS_BEFORE = 5;
const FERTILE_DAYS_AFTER = 1;

export type PredictionSource = 'insufficient-data' | 'stale-history' | 'calendar' | 'luteal';

export interface FertileWindow {
  start: DayKey;
  end: DayKey;
}

export interface Prediction {
  /** 1 on the first day of bleeding. Null when there is no history to count from. */
  cycleDay: number | null;
  averageCycleLength: number | null;
  averageLutealLength: number | null;
  nextPeriodStart: DayKey | null;
  ovulationDate: DayKey | null;
  fertileWindow: FertileWindow | null;
  /** Days either side of `nextPeriodStart`. Always within the clamp above. */
  uncertaintyDays: number;
  source: PredictionSource;
  /** How many usable cycles the estimate rests on. */
  cyclesObserved: number;
}

export interface PredictionInput {
  /** First day of each period, ascending and deduplicated. */
  periodStarts: DayKey[];
  /** Ovulation days with retrospective evidence behind them, ascending. */
  ovulations?: DayKey[];
  today: DayKey;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median absolute deviation: the spread measure that does not move when one
 * cycle is twice as long as the rest. A standard deviation would, and a single
 * illness or a mistyped year would then swamp the band.
 */
function medianAbsoluteDeviation(values: number[], centre: number): number {
  if (values.length < 2) return 0;
  return median(values.map((v) => Math.abs(v - centre)));
}

function clampUncertainty(days: number): number {
  return Math.max(MIN_UNCERTAINTY_DAYS, Math.min(MAX_UNCERTAINTY_DAYS, Math.round(days)));
}

/** Consecutive gaps that look like cycles rather than typos. */
export function cycleLengths(periodStarts: DayKey[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < periodStarts.length; i++) {
    const span = daysBetween(periodStarts[i - 1], periodStarts[i]);
    if (span >= MIN_CYCLE_DAYS && span <= MAX_CYCLE_DAYS) out.push(span);
  }
  return out;
}

/**
 * Luteal length is measured, not assumed, wherever an ovulation sits between
 * two period starts — that pairing is the only thing that makes it observable.
 */
export function averageLutealLength(periodStarts: DayKey[], ovulations: DayKey[]): number | null {
  const spans: number[] = [];
  for (const ovulation of ovulations) {
    const next = periodStarts.find((start) => daysBetween(ovulation, start) > 0);
    if (!next) continue;
    const span = daysBetween(ovulation, next);
    // A luteal phase outside this is a mispaired ovulation, not a short one.
    if (span >= 7 && span <= 20) spans.push(span);
  }
  return spans.length ? Math.round(median(spans)) : null;
}

export function fertileWindowAround(ovulation: DayKey): FertileWindow {
  return {
    start: addDays(ovulation, -FERTILE_DAYS_BEFORE),
    end: addDays(ovulation, FERTILE_DAYS_AFTER),
  };
}

const EMPTY: Omit<Prediction, 'source' | 'cycleDay' | 'cyclesObserved'> = {
  averageCycleLength: null,
  averageLutealLength: null,
  nextPeriodStart: null,
  ovulationDate: null,
  fertileWindow: null,
  uncertaintyDays: MAX_UNCERTAINTY_DAYS,
};

export function predict(input: PredictionInput): Prediction {
  const starts = [...new Set(input.periodStarts)].sort();
  const ovulations = [...new Set(input.ovulations ?? [])].sort();
  const last = starts[starts.length - 1];

  if (!last) {
    return { ...EMPTY, cycleDay: null, cyclesObserved: 0, source: 'insufficient-data' };
  }

  const sinceLast = daysBetween(last, input.today);
  // Counting from a period start that is months old produces a cycle day in the
  // hundreds, which is not a cycle day — it is a gap in the record.
  const cycleDay = sinceLast >= 0 && sinceLast <= MAX_CYCLE_DAYS ? sinceLast + 1 : null;

  if (sinceLast > STALE_HISTORY_DAYS) {
    return { ...EMPTY, cycleDay, cyclesObserved: 0, source: 'stale-history' };
  }

  const lengths = cycleLengths(starts).slice(-HISTORY_WINDOW);
  if (!lengths.length) {
    return { ...EMPTY, cycleDay, cyclesObserved: 0, source: 'insufficient-data' };
  }

  const averageCycle = Math.round(median(lengths));
  const luteal = averageLutealLength(starts, ovulations);
  const lutealDays = luteal ?? DEFAULT_LUTEAL_DAYS;

  // An ovulation inside the current cycle dates the next period better than the
  // calendar does, because the luteal phase is the steadier half.
  const currentOvulation = ovulations.filter((o) => daysBetween(last, o) >= 0).pop();
  const source: PredictionSource = currentOvulation ? 'luteal' : 'calendar';
  const nextPeriodStart = currentOvulation
    ? addDays(currentOvulation, lutealDays)
    : addDays(last, averageCycle);

  const ovulationDate = currentOvulation ?? addDays(nextPeriodStart, -lutealDays);

  // Spread of the observed cycles, widened while the history is still short.
  // Three cycles cannot tell a steady body from a lucky run of three.
  const spread = medianAbsoluteDeviation(lengths, median(lengths));
  const thinHistory = Math.max(0, 4 - lengths.length) * 1.5;
  // A dated ovulation removes the follicular phase — the variable half — from
  // the estimate, so the band earns a day back.
  const anchored = currentOvulation ? -1 : 0;
  const uncertaintyDays = clampUncertainty(spread + thinHistory + anchored + MIN_UNCERTAINTY_DAYS);

  return {
    cycleDay,
    averageCycleLength: averageCycle,
    averageLutealLength: luteal,
    nextPeriodStart,
    ovulationDate,
    fertileWindow: fertileWindowAround(ovulationDate),
    uncertaintyDays,
    source,
    cyclesObserved: lengths.length,
  };
}

/**
 * Period starts, read out of the day log.
 *
 * An explicit `periodStart` wins where it is set. Otherwise a start is the
 * first bleeding day of a run — with a one-day gap tolerated, because a light
 * second day that went unlogged should not split one period into two and halve
 * the cycle length that gets averaged.
 */
export function periodStartsFrom(entries: CycleEntry[]): DayKey[] {
  const bleeding = new Set(entries.filter((e) => e.flow).map((e) => e.day));
  const explicit = new Set(entries.filter((e) => e.periodStart).map((e) => e.day));
  const days = [...new Set([...bleeding, ...explicit])].sort();

  const starts: DayKey[] = [];
  for (const day of days) {
    if (explicit.has(day)) {
      starts.push(day);
      continue;
    }
    const precededByRun = bleeding.has(addDays(day, -1)) || bleeding.has(addDays(day, -2));
    if (!precededByRun) starts.push(day);
  }
  // A run that both flags its first day and bleeds on it would list it twice.
  return [...new Set(starts)].sort();
}

/** Days the estimate says a period is overdue by, or 0. */
export function daysLate(prediction: Prediction, today: DayKey): number {
  if (!prediction.nextPeriodStart) return 0;
  return Math.max(0, daysBetween(prediction.nextPeriodStart, today));
}
