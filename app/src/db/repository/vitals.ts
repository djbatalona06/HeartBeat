import { db } from '../database';
import type { DayKey } from '../../domain/types';
import { addDays } from '../../domain/day';
import { type DayLog, type LogKind, type Vitals, vitalsOf } from '../../domain/rpg/vitals';

/* -- the couple's vitals -----------------------------------------------------
 * Read-only, which is the whole character of this section: there is no write
 * here and no table of its own, because every number the pet shows is derived
 * from the day log both phones already reconcile. See the banner at the top of
 * `domain/rpg/vitals.ts` for why that is not a shortcut but the point.
 */

/**
 * How far back the walk looks.
 *
 * Comfortably past the longest streak anyone is going to have, and short enough
 * that this stays three indexed range reads rather than three table scans. A
 * couple whose streak somehow outlives it lose nothing they can see: the total
 * is a sum over a window that already holds every day that matters to the
 * stages, and the streak is capped by the same window in the domain module.
 */
export const VITALS_WINDOW_DAYS = 400;

/**
 * Every log in the window, as one row per member per day.
 *
 * The three tables are read in parallel and folded into a map keyed by
 * `day|member`, so a person who logged a mood and a workout on the same day is
 * one `DayLog` with two kinds — which is what lets the together bonus be paid
 * per day rather than per log.
 *
 * Not filtered by member on purpose. Every row in these tables belongs to this
 * couple, the partner's arrive through `/api/entries`, and the pet is fed by
 * both of you: filtering to "mine" here is exactly the bug that made the old
 * pet bar a private number under a shared heading.
 */
export async function dayLogs(today: DayKey): Promise<DayLog[]> {
  const from = addDays(today, -VITALS_WINDOW_DAYS);

  const [moods, exercises, cycles] = await Promise.all([
    db.moods.where('day').aboveOrEqual(from).toArray(),
    db.exercises.where('day').aboveOrEqual(from).toArray(),
    db.cycles.where('day').aboveOrEqual(from).toArray(),
  ]);

  const byKey = new Map<string, DayLog>();
  const add = (day: DayKey, memberId: string, kind: LogKind) => {
    const key = `${day}|${memberId}`;
    const row = byKey.get(key) ?? { day, memberId, kinds: [] as LogKind[] };
    if (!row.kinds.includes(kind)) row.kinds.push(kind);
    byKey.set(key, row);
  };

  for (const mood of moods) add(mood.day, mood.memberId, 'mood');
  for (const exercise of exercises) add(exercise.day, exercise.memberId, 'exercise');
  // An empty cycle draft is deleted rather than stored (see `putCycle`), so a
  // row here is always something somebody actually said.
  for (const cycle of cycles) add(cycle.day, cycle.memberId, 'cycle');

  return [...byKey.values()];
}

/**
 * The pet's attributes, streak, glow and stage as of today.
 *
 * Safe inside a `useLiveQuery`: it touches only the three entry tables, so
 * Dexie re-runs it when either phone's log changes and at no other time. It
 * does not read settings — that would re-fire the query up to twenty times a
 * foreground cycle — so the caller passes the day key in, already in the
 * member's own timezone.
 */
export async function coupleVitals(today: DayKey): Promise<Vitals> {
  return vitalsOf(await dayLogs(today), today);
}
