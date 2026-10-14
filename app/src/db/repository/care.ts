import { db } from '../database';
import { addDays } from '../../domain/day';
import {
  PANTRY_DAYS, canFeed, earnedFood, feedActId, pantryOf, ritualActId,
  type CareAct, type FoodItem, type RitualKind,
} from '../../domain/rpg/care';
import type { DayKey, MemberId } from '../../domain/types';
import { now } from './shared';

/**
 * Looking after the pet: feeding it, and the three rituals.
 *
 * One row per act, forever, and the id is derived rather than minted (see
 * `domain/rpg/care.ts`). That makes a second tap the same row and two phones
 * acting at once one row each instead of a race. There is no undo, for the
 * reason `cheers.ts` gives: holdings sync has no tombstone, so a deleted row is
 * resurrected by the next pull.
 */

export interface CareResult {
  ok: boolean;
  reason?: string;
}

/**
 * Feed the pet one item from the pantry.
 *
 * `feederId` is who is tapping, and it need not be who earned the item -- that
 * is "feeding for each other". The row is written under the feeder's id, which
 * is also what the server will check the row against.
 *
 * The existing-row early return is the point, not an optimisation: re-putting
 * the row with a fresh `updatedAt` would push it again and re-fire every live
 * query watching the table, for a write that changes nothing anybody can see.
 */
export async function feedPet(
  coupleId: string,
  feederId: MemberId,
  item: FoodItem,
  today: DayKey,
): Promise<CareResult> {
  return db.transaction('rw', db.careActs, async () => {
    const earliest = addDays(today, -(PANTRY_DAYS - 1));
    const recent = await db.careActs.where('day').aboveOrEqual(earliest).toArray();

    // An item eaten by the *other* phone is refused here too, not just an item
    // this phone ate: the pantry counts item keys across both feeders.
    const check = canFeed(item, recent);
    if (!check.ok) return { ok: false, reason: check.reason };

    const rowId = feedActId(item, feederId);
    if (await db.careActs.get(rowId)) return { ok: true };

    const at = now();
    const act: CareAct = {
      id: rowId,
      coupleId,
      memberId: feederId,
      kind: item.kind,
      day: today,
      earnerId: item.earnerId,
      earnedDay: item.earnedDay,
      createdAt: at,
      updatedAt: at,
    };
    await db.careActs.put(act);
    return { ok: true };
  });
}

/** Pet, play or rest: once a day each, per person. */
export async function performRitual(
  coupleId: string,
  memberId: MemberId,
  kind: RitualKind,
  day: DayKey,
): Promise<CareResult> {
  return db.transaction('rw', db.careActs, async () => {
    const rowId = ritualActId(kind, day, memberId);
    if (await db.careActs.get(rowId)) return { ok: true };

    const at = now();
    await db.careActs.put({
      id: rowId, coupleId, memberId, kind, day, createdAt: at, updatedAt: at,
    });
    return { ok: true };
  });
}

export interface CareSnapshot {
  /** Every act, both of you, oldest first. Small by construction: a few a day. */
  acts: CareAct[];
  /** Everything the last two days of logging earned, eaten or not. */
  items: FoodItem[];
  /** The part of `items` nobody has fed yet. */
  pantry: FoodItem[];
}

/**
 * Everything the care panel draws, in one read.
 *
 * Safe inside a `useLiveQuery`: it touches only the mood, exercise and care
 * tables, so Dexie re-runs it when either phone's log or either phone's care
 * changes and at no other time. It does not read settings -- the caller passes
 * the day key in, already in the member's own timezone.
 *
 * Not filtered by member on purpose: the pantry is the couple's, and a partner's
 * meal sitting in it is the whole of "feed it for each other".
 */
export async function loadCare(today: DayKey): Promise<CareSnapshot> {
  const earliest = addDays(today, -(PANTRY_DAYS - 1));
  const [moods, exercises, acts] = await Promise.all([
    db.moods.where('day').aboveOrEqual(earliest).toArray(),
    db.exercises.where('day').aboveOrEqual(earliest).toArray(),
    db.careActs.orderBy('day').toArray(),
  ]);
  const items = earnedFood(moods, exercises, today);
  return { acts, items, pantry: pantryOf(items, acts) };
}
