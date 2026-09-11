import { db } from '../database';
import { id, now } from './shared';
import { awardPetXp } from './petXp';


/* ---- achievements --------------------------------------------------------- */

/**
 * The shelf's one writer.
 *
 * `achievements` has existed since v1 of the schema and nothing had ever put a
 * row in it. This is its first writer, and the only one: everything else about
 * achievements is pure, in `domain/achievements/`.
 *
 * Two things about the shape below are load-bearing.
 *
 * The stored codes are read *inside* the transaction that writes them. The
 * caller is a live query, which re-fires whenever a table it watches changes —
 * including the writes this function is making. Taking "what is already
 * unlocked" as an argument, or reading it before the transaction opened, means
 * a second call that overlaps the first sees a shelf that is already out of
 * date and pays the same rung again. Dexie serialises transactions touching the
 * same table, so reading within is what makes the second call find nothing.
 *
 * The counters are gathered before the transaction, and deliberately: holding a
 * write lock across a dozen tables to read numbers off them is a great deal of
 * blocking for no guarantee. A counter that is a moment stale can only ever
 * under-award, and the next call — which any of these writes will trigger —
 * picks it up. Over-awarding is the failure that matters, and that is the one
 * the transaction prevents.
 *
 * The XP is added through `addXp`, so the shared pet stays the only place
 * achievement XP can land. There is no second arithmetic here to disagree with
 * the one every other payout uses.
 *
 * The imports sit here rather than at the top of the file on purpose: this
 * section is one clean append, and imports hoist, so it costs nothing.
 */
import { ACHIEVEMENTS, type AchievementDef } from '../../domain/achievements/catalogue';
import { countGear, newlyEarned, payoutFor, stateFrom } from '../../domain/achievements/unlock';
import { levelForXp } from '../../domain/xp';
import type { Achievement } from '../../domain/types';

/** What a claim did, so a screen can say so without re-deriving it. */
export interface ClaimResult {
  unlocked: AchievementDef[];
  xp: number;
}

/**
 * Count the calendar days a table has rows on.
 *
 * Days, not rows, and not member-days either. Every "days" blurb in the
 * catalogue promises the calendar — "Sixty days of saying how it was" — and a
 * couple where both people log produces two rows for one day, so counting rows
 * hands the sixty-day rung over on the thirtieth. Counting member-days has the
 * same fault. `daysByMeasure` in the quests section counts distinct days for
 * exactly these measures; this is the same rule, said once more.
 *
 * Streamed rather than read into an array: `workoutPhotos` carries a base64
 * JPEG per row, and pulling every one of them into memory to look at its `day`
 * is how a phone with a year of proof runs out of it.
 */
async function daysOn(table: { each(fn: (row: { day?: string }) => void): Promise<unknown> }): Promise<number> {
  const days = new Set<string>();
  await table.each((row) => { if (row.day) days.add(row.day); });
  return days.size;
}

/**
 * Everything the rungs are measured against.
 *
 * Every table read here holds one couple's rows and no one else's, so a count
 * is the couple's count. Achievements are the couple's rather than one
 * person's: the row carries a coupleId and no memberId, and the shelf is
 * shared.
 */
export async function achievementState(coupleId: string) {
  const [
    moodDays, exerciseDays, proofDays, events, cycleDays, notes,
    vibesSent, tasks, avatars, pets, pet,
  ] = await Promise.all([
    daysOn(db.moods),
    daysOn(db.exercises),
    daysOn(db.workoutPhotos),
    // Entries, not days: this track is blurbed "Twenty things planned" and
    // "A hundred entries on the calendar", so three appointments on one
    // Saturday are three. `messages` below is a row count for the same reason.
    // The quest engine's `planDays` counts days because it asks a different
    // question — how many days you *added* something to the calendar.
    db.work.count(),
    daysOn(db.cycles),
    // Notes carry a timestamp rather than a day, and "a hundred and fifty
    // notes" is a count of notes, so this one stays a row count on purpose.
    db.messages.count(),
    // `kind` is not an index on this table, so this is a scan rather than a
    // lookup. It is a handful of rows and adding an index would mean a Dexie
    // version bump for a counter.
    //
    // Since life events sync, this is the *union* of what both phones hold, not
    // a sum of two counts — each row keeps its own id, so nothing is counted
    // twice. It does now mean "vibes either of us sent", which is why the
    // catalogue copy is in the couple's voice.
    db.lifeEvents.filter((e) => e.kind === 'good-vibes').count(),
    db.tasks.toArray(),
    db.avatars.toArray(),
    db.pets.count(),
    db.pet.get(coupleId),
  ]);

  return stateFrom({
    moodDays,
    exerciseDays,
    proofDays,
    events,
    cycleDays,
    notes,
    vibesSent,
    pets,
    tasks,
    // The fullest either sheet has been dressed, not the sum: "every slot
    // filled" is a thing one character does, not a total across two.
    gear: avatars.reduce<Record<string, string | undefined>>(
      (best, a) => (countGear(a.gear) > countGear(best) ? a.gear : best),
      {},
    ),
    petLevel: pet ? levelForXp(pet.xp) : 0,
  });
}

/**
 * Award every rung the couple has reached and not yet been given.
 *
 * Safe to call as often as anything likes: with nothing new it reads, finds no
 * codes, and writes nothing at all — not even the XP.
 */
export async function claimAchievements(coupleId: string): Promise<ClaimResult> {
  const state = await achievementState(coupleId);

  return db.transaction('rw', [db.achievements, db.pet], async () => {
    const stored = await db.achievements.where('coupleId').equals(coupleId).toArray();
    const fresh = newlyEarned(state, stored.map((row) => row.code));
    if (fresh.length === 0) return { unlocked: [], xp: 0 };

    const at = now();
    const rows: Achievement[] = fresh.map((def) => ({
      id: id(),
      coupleId,
      code: def.code,
      xp: payoutFor([def]),
      unlockedAt: at,
    }));
    await db.achievements.bulkPut(rows);

    // One award per rung, named after the rung rather than at random.
    // Achievements are the couple's and both phones evaluate them off the same
    // synced data, so both reach mood.2 and both report it. A random id makes
    // those two reports two credits on the shared pet; a derived one makes them
    // the same award, which is the shape `awardBossVictory` already uses and
    // the reason `pet_xp_awards` is keyed the way it is. It also makes a
    // re-claim on this phone a no-op, since `awardPetXp` knows the id already.
    for (const def of fresh) await awardPetXp(coupleId, `ach-${def.code}`, payoutFor([def]));

    const xp = payoutFor(fresh);
    return { unlocked: fresh, xp };
  });
}

/** Everything the couple has been given, newest first. */
export async function listAchievements(coupleId: string): Promise<Achievement[]> {
  const rows = await db.achievements.where('coupleId').equals(coupleId).toArray();
  return rows.sort((a, b) => b.unlockedAt - a.unlockedAt);
}

/** The catalogue, so a screen can show what is still ahead. */
export { ACHIEVEMENTS };
