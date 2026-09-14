import { db } from '../database';
import type { CoupleId, DayKey } from '../../domain/types';
import { addDays, daysBetween } from '../../domain/day';
import {
  clearStage, newWorldProgress, travelTo, type WorldProgress,
} from '../../domain/rpg/world';
import { FRESH_MOMENTUM, type Momentum } from '../../domain/rpg/diorama';
import { dayLogs } from './vitals';
import { now } from './shared';

/**
 * Eve's Garden's world progress: the one row that says where the couple are.
 *
 * Everything decided here is decided in `domain/rpg/world.ts` — this module
 * only reads, writes, and keeps the two in one transaction. The pattern is
 * `petXp.ts`'s: read-modify-write inside `db.transaction`, because a sync
 * applying a pulled row at the same moment does the same read-modify-write on
 * the same key, and outside a transaction the later `put` carries the earlier
 * one's snapshot and silently drops a cleared stage.
 */

/** The couple's row, minted on first read so callers never handle `undefined`. */
export async function loadWorldProgress(coupleId: CoupleId): Promise<WorldProgress> {
  const stored = await db.worldProgress.get(coupleId);
  return stored ?? newWorldProgress(coupleId, now());
}

/**
 * Record a stage win.
 *
 * Idempotent by monster id, so the second report of the same victory — the
 * partner's phone, or a retried write — is a no-op rather than a second clear.
 * Returns the row as it now stands.
 */
export async function clearStageFor(
  coupleId: CoupleId,
  monsterId: string,
): Promise<WorldProgress> {
  return db.transaction('rw', db.worldProgress, async () => {
    const current = await db.worldProgress.get(coupleId) ?? newWorldProgress(coupleId, now());
    const next = clearStage(current, monsterId, now());
    // `clearStage` returns the same object when the id was already there.
    // Skipping the write keeps every live query reading this row from
    // re-firing for nothing — the same reasoning as `shouldApply`'s
    // strictly-greater comparison in domain/sync/holdings.ts.
    if (next === current && await db.worldProgress.get(coupleId)) return current;
    await db.worldProgress.put(next);
    return next;
  });
}

/** Move to another island. Refused silently if it is not unlocked yet. */
export async function travelToIsland(
  coupleId: CoupleId,
  island: number,
): Promise<WorldProgress> {
  return db.transaction('rw', db.worldProgress, async () => {
    const current = await db.worldProgress.get(coupleId) ?? newWorldProgress(coupleId, now());
    const next = travelTo(current, island, now());
    if (next === current && await db.worldProgress.get(coupleId)) return current;
    await db.worldProgress.put(next);
    return next;
  });
}

/**
 * The three numbers `diorama.variantFor` reads, gathered from the logs.
 *
 * Deliberately not filtered by member, for the same reason `dayLogs` is not:
 * the garden is the couple's, and a week where one of them logged every day is
 * not a quiet week. Filtering to "mine" here would be the bug that made the old
 * pet bar a private number under a shared heading.
 *
 * Safe inside a `useLiveQuery`: it reads only the entry tables, so Dexie
 * re-runs it when either phone logs something and at no other time. It does not
 * call `loadSettings` — that would re-fire the query up to twenty times a
 * foreground cycle — so the caller passes the day key in, already in the
 * member's own timezone.
 */
export async function gardenMomentum(today: DayKey): Promise<Momentum> {
  const logs = await dayLogs(today);
  if (logs.length === 0) return FRESH_MOMENTUM;

  const days = [...new Set(logs.map((log) => log.day))];
  const daysSinceLog = Math.max(
    0,
    Math.min(...days.map((day) => daysBetween(day, today))),
  );

  const weekStart = addDays(today, -6);
  const loggedDays = days.filter((day) => day >= weekStart && day <= today).length;

  // Mood is averaged over the same week rather than over everything, so a good
  // month cannot hide a hard week and one hard week cannot outlive itself.
  const recent = await db.moods.where('day').aboveOrEqual(weekStart).toArray();
  if (recent.length === 0) return { daysSinceLog, loggedDays };

  const mean = (pick: (entry: (typeof recent)[number]) => number) =>
    recent.reduce((sum, entry) => sum + pick(entry), 0) / recent.length;

  return {
    daysSinceLog,
    loggedDays,
    joy: mean((entry) => entry.joy),
    moody: mean((entry) => entry.moody),
  };
}
