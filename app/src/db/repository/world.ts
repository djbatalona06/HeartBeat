import { db } from '../database';
import type { CoupleId } from '../../domain/types';
import {
  clearStage, newWorldProgress, travelTo, type WorldProgress,
} from '../../domain/rpg/world';
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
