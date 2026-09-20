import { db } from '../database';
import { startOfWeek } from '../../domain/day';
import {
  endOfWager, markSettled, newWager, reckonWager, stakeFor,
  type WagerCounts, type WagerStep,
} from '../../domain/wager/engine';
import type { CoupleId, DayKey, MemberId, Wager } from '../../domain/types';
import { exercisesInRange, trainedDays } from './entries';
import { awardPetXp } from './petXp';
import { now } from './shared';

/* ---- the weekly wager ----------------------------------------------------- */

/**
 * What the two of you staked on a week, and whether it has paid.
 *
 * The arithmetic is `domain/wager/engine.ts`; this is the half that touches
 * Dexie. The split is the same one `quests.ts` keeps, and for the same reason:
 * the rules are testable without a database and the writes are testable
 * against one.
 */

/** The wager covering a given day, if one was ever started for that week. */
export async function wagerFor(coupleId: CoupleId, day: DayKey): Promise<Wager | undefined> {
  return db.wagers
    .where('[coupleId+weekStart]')
    .equals([coupleId, startOfWeek(day)])
    .first();
}

/** Every wager a couple has held, newest week first. */
export async function pastWagers(coupleId: CoupleId): Promise<Wager[]> {
  const rows = await db.wagers.where('coupleId').equals(coupleId).toArray();
  return rows.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

/**
 * Take one on, or change the target of the one already there.
 *
 * ## Why this is an upsert rather than an insert
 *
 * The id is derived from the couple and the Monday, so both phones compute the
 * same key and a wager started on each of them converges on one row instead of
 * leaving the couple holding two. That is the property that makes this safe to
 * call from either side without a lock — see the note on `Wager`.
 *
 * ## A settled week is not re-openable
 *
 * Once the pet has been paid, changing the target would either pay twice or
 * retroactively un-pay. Either is worse than refusing, and the refusal is
 * silent-by-return rather than a throw: the screen offering the control is
 * driven by a live query and may be a frame behind the reconciliation that
 * settled it.
 */
export async function startWager(
  coupleId: CoupleId,
  day: DayKey,
  target: number,
): Promise<Wager | undefined> {
  const at = now();
  return db.transaction('rw', [db.wagers], async () => {
    const weekStart = startOfWeek(day);
    const existing = await db.wagers
      .where('[coupleId+weekStart]')
      .equals([coupleId, weekStart])
      .first();

    if (existing?.settledAt !== undefined) return undefined;

    const next: Wager = existing
      // The id and the week are kept: this is the same wager with a different
      // number on it, not a new one, and replacing the id would orphan the row
      // the other phone already has.
      ? { ...existing, target, stake: stakeFor(target), updatedAt: at }
      : newWager({ coupleId, day, target, now: at });

    await db.wagers.put(next);
    return next;
  });
}

/** Give up on a week without settling it. The row goes; nothing is taken. */
export async function dropWager(coupleId: CoupleId, day: DayKey): Promise<void> {
  await db.transaction('rw', [db.wagers], async () => {
    const existing = await db.wagers
      .where('[coupleId+weekStart]')
      .equals([coupleId, startOfWeek(day)])
      .first();
    // A settled week is a record of something that happened, so it stays.
    if (!existing || existing.settledAt !== undefined) return;
    await db.wagers.delete(existing.id);
  });
}

/**
 * How many days each of them trained inside a wager's week.
 *
 * Days, not entries: two sessions on a Tuesday is one day of the week gone,
 * which is what somebody aiming at "three this week" means. `trainedDays` is
 * the same definition the week strip and the calendar tint use, so all three
 * agree about what counts.
 *
 * `timeZone` is not taken and not needed — the rows already carry day keys
 * written in the member's zone when they were saved.
 */
export async function wagerCounts(wager: Pick<Wager, 'weekStart'>): Promise<WagerCounts> {
  const rows = await exercisesInRange(wager.weekStart, endOfWager(wager));
  const byMember = new Map<MemberId, typeof rows>();
  for (const row of rows) {
    const list = byMember.get(row.memberId);
    if (list) list.push(row);
    else byMember.set(row.memberId, [row]);
  }

  const out: Record<MemberId, number> = {};
  for (const [memberId, list] of byMember) {
    const days = trainedDays(list).length;
    // A member whose only row that week is a caption has trained zero days,
    // and zero is what an absent member already reads as. Emitting the key
    // anyway would make two spellings of the same fact, and the day somebody
    // switches from `counts[id] ?? 0` to `id in counts` they would disagree.
    if (days > 0) out[memberId] = days;
  }
  return out;
}

export interface WagerReading {
  wager?: Wager;
  counts: WagerCounts;
  step?: WagerStep;
}

/**
 * Everything a screen needs about this week, in one read.
 *
 * `members` is passed in rather than read from the members table, for the
 * reason `measureQuest` takes its `timeZone`: this runs inside a live query,
 * and a second table read there is a second thing to re-fire on.
 *
 * It deliberately writes nothing, so it is safe in a render path.
 * `settleWager` is the half that pays.
 */
export async function readWager(
  coupleId: CoupleId,
  day: DayKey,
  members: readonly MemberId[],
): Promise<WagerReading> {
  const wager = await wagerFor(coupleId, day);
  if (!wager) return { counts: {} };
  const counts = await wagerCounts(wager);
  return { wager, counts, step: reckonWager(wager, members, counts, day) };
}

export interface WagerSettlement {
  wager: Wager;
  awarded: number;
  won: boolean;
  missed: boolean;
}

/**
 * Pay every week that was won and close every week that ran out.
 *
 * ## Why this is plural, and why it does not take a week
 *
 * The obvious signature was `settleWager(coupleId, day)`, looking the wager up
 * by that day's week. It cannot ever record a miss. By the time a week has run
 * out, "today" is in the *next* week, so a lookup keyed on today finds a
 * different wager — or none — and last week's sits unsettled forever. The
 * caller would have had to know to pass a day inside the week it wanted
 * closed, which is knowledge no screen has.
 *
 * So this asks the opposite question: which of this couple's wagers are still
 * open, and what does today say about each. A won week pays the moment both of
 * them arrive; a finished week closes the next time anything calls this. That
 * makes it safe to call from the same places `settleTasks` and
 * `settleLifeEvents` are called from, with today's date and nothing else.
 *
 * ## The pay-once guard
 *
 * Counts are measured outside the transaction and the row re-read inside it,
 * exactly as `reconcileQuests` does. Whether a week has already been paid is a
 * question only the transaction may answer; a call that trusted the row it
 * read outside would pay twice when two of them overlap.
 *
 * `awardPetXp`'s id is derived from the wager's own id, which is itself derived
 * from the couple and the week. So even two devices settling one week at the
 * same instant offer the server the same award id, and it credits it once.
 */
export async function settleWagers(
  coupleId: CoupleId,
  today: DayKey,
  members: readonly MemberId[],
): Promise<WagerSettlement[]> {
  const open = (await db.wagers.where('coupleId').equals(coupleId).toArray())
    .filter((w) => w.settledAt === undefined)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  if (open.length === 0) return [];

  // Measured before the transaction, one read per open week. In practice that
  // is one — a couple has one live wager — and at most a handful after a phone
  // has been off for a month.
  const measured = await Promise.all(
    open.map(async (wager) => ({ wager, counts: await wagerCounts(wager) })),
  );

  return db.transaction('rw', [db.wagers, db.pet], async () => {
    const out: WagerSettlement[] = [];

    for (const { wager, counts } of measured) {
      const fresh = await db.wagers.get(wager.id);
      // Settled by whoever got here first, or gone.
      if (!fresh || fresh.settledAt !== undefined) continue;

      const step = reckonWager(fresh, members, counts, today);

      if (step.verb === 'won') {
        const at = now();
        await db.wagers.put(markSettled(fresh, true, at));
        await awardPetXp(coupleId, `wager-${fresh.id}`, step.award);
        out.push({ wager: fresh, awarded: step.award, won: true, missed: false });
        continue;
      }

      if (step.verb === 'missed') {
        // Closed, not deleted, and nothing taken. The row is the record that
        // the week was staked at all, which is the honest version of a miss.
        await db.wagers.put(markSettled(fresh, false, now()));
        out.push({ wager: fresh, awarded: 0, won: false, missed: true });
      }

      // Still running: nothing written, nothing reported.
    }

    return out;
  });
}
