import { db } from '../database';
import { canCheer, cheerId } from '../../domain/rpg/feed';
import type { Cheer, LifeEvent } from '../../domain/rpg/types';
import type { MemberId } from '../../domain/types';
import { now } from './shared';

/**
 * Cheering something the other person logged.
 *
 * One row per person per event, forever. The id is derived from the pair rather
 * than minted (see `domain/rpg/feed.ts`), which makes a second tap the same row
 * and a simultaneous tap on two phones one row instead of a race.
 */

export interface CheerResult {
  ok: boolean;
  reason?: string;
}

/**
 * Cheer an event, once.
 *
 * The early return on an existing row is the point of the function, not a
 * micro-optimisation. Re-putting the row with a fresh `updatedAt` would push it
 * again on the next sync and re-fire every live query watching the table, for
 * a write that changes nothing anybody can see.
 */
export async function putCheer(
  coupleId: string,
  memberId: MemberId,
  event: LifeEvent,
): Promise<CheerResult> {
  const check = canCheer(event, memberId);
  if (!check.ok) return { ok: false, reason: check.reason };

  return db.transaction('rw', db.cheers, async () => {
    const rowId = cheerId(event.id, memberId);
    const existing = await db.cheers.get(rowId);
    if (existing) return { ok: true };

    const at = now();
    const row: Cheer = {
      id: rowId,
      coupleId,
      memberId,
      eventId: event.id,
      createdAt: at,
      updatedAt: at,
    };
    await db.cheers.put(row);
    return { ok: true };
  });
}

/** Every cheer on a given set of events, in one read rather than one per event. */
export async function cheersFor(eventIds: readonly string[]): Promise<Cheer[]> {
  if (!eventIds.length) return [];
  return db.cheers.where('eventId').anyOf([...eventIds]).toArray();
}
