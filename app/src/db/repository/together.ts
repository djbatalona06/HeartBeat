import { db } from '../database';
import type { DayKey, MemberId } from '../../domain/types';
import {
  DUO_WEEK_XP, type DuoWeek, type Reunion, type TogetherTier,
  duoWeek, loyaltyPoints, nextTier, pointsToNext, reunion, tierAt, tiersReached,
} from '../../domain/rpg/together';
import { awardPetXp } from './petXp';

/* -- the Together panel ------------------------------------------------------
 * The duo week, the way back, and the loyalty ladder. `domain/rpg/together.ts`
 * decides all of it; this reads the rows and pays.
 */

/**
 * Every logging day the couple has ever had, as day -> who logged on it.
 *
 * Deliberately **not** `dayLogs()` from the vitals section, which is bounded to
 * a 400-day window. A window is right for a streak, which only looks backwards
 * until it breaks, and wrong for the ladder: points recomputed over a sliding
 * window would *fall* as old days drop out of the back of it, and a couple
 * could be demoted out of a tier by nothing more than time passing. That is
 * precisely the punishment this repository rules out, arriving through the back
 * door, so the ladder counts everything and the totals only ever grow.
 *
 * Streamed with `.each` rather than `.toArray()`, following `daysOn` in the
 * achievements section. These three tables are one small row per member per day
 * — `workoutPhotos`, the one table with a base64 payload in it, is not read
 * here at all.
 */
async function lifetimeMembers(): Promise<Map<DayKey, Set<MemberId>>> {
  const members = new Map<DayKey, Set<MemberId>>();
  const add = (row: { day?: string; memberId?: string }) => {
    if (!row.day || !row.memberId) return;
    const seen = members.get(row.day) ?? new Set<MemberId>();
    seen.add(row.memberId);
    members.set(row.day, seen);
  };

  // An empty cycle draft is deleted rather than stored (see `putCycle`), so a
  // row in any of the three is always something somebody actually said.
  await Promise.all([db.moods.each(add), db.exercises.each(add), db.cycles.each(add)]);
  return members;
}

/**
 * Whether the reunion quest belongs on the board right now.
 *
 * Exported for `quests.ts`, which gates the one template that is not offered
 * by default. Sections import each other directly rather than through the
 * barrel — routing this through `./index` would make the graph cyclic.
 */
export async function reunionNow(today: DayKey): Promise<Reunion> {
  return reunion(await lifetimeMembers(), today);
}

export interface TogetherView {
  week: DuoWeek;
  back: Reunion;
  points: number;
  tier: TogetherTier;
  next: TogetherTier | undefined;
  toNext: number;
}

/**
 * Everything the Together panel shows.
 *
 * Safe inside a `useLiveQuery`: it touches the three entry tables plus quests
 * and achievements, so Dexie re-runs it when any of those change and at no
 * other time. It does **not** read settings — that would re-fire the query up
 * to twenty times a foreground cycle — so the caller passes the day key in,
 * already in the member's own timezone.
 */
export async function coupleTogether(coupleId: string, today: DayKey): Promise<TogetherView> {
  const [members, quests, achievements] = await Promise.all([
    lifetimeMembers(),
    db.quests.where('coupleId').equals(coupleId).toArray(),
    db.achievements.where('coupleId').equals(coupleId).toArray(),
  ]);

  let loggedDays = 0;
  let duoDays = 0;
  for (const seen of members.values()) {
    loggedDays += seen.size;
    if (seen.size >= 2) duoDays += 1;
  }

  const points = loyaltyPoints({
    loggedDays,
    duoDays,
    questsFinished: quests.filter((quest) => quest.completedAt).length,
    achievementXp: achievements.reduce((sum, row) => sum + (row.xp ?? 0), 0),
  });

  return {
    week: duoWeek(members, today),
    back: reunion(members, today),
    points,
    tier: tierAt(points),
    next: nextTier(points),
    toNext: pointsToNext(points),
  };
}

/**
 * Pay for a finished week and for every rung crossed.
 *
 * There is no ledger of its own here and no "claimed" flag, because
 * `awardPetXp` already is one: an award is keyed by a **derived** id, so the
 * same week settled by both phones — or by the same phone on every render —
 * lands on the same id and credits once, here and on the server. That is the
 * convention `ach-${code}` and `quest-${id}` already use.
 *
 * `duo-<day>` is the day a complete week landed on, so a couple who keep a
 * fortnight going are paid twice, on two different ids, rather than once.
 *
 * Gain-only by construction: `awardPetXp` clamps upward and there is no other
 * write in this function.
 */
export async function settleTogether(coupleId: string, today: DayKey): Promise<void> {
  const view = await coupleTogether(coupleId, today);

  if (view.week.completedOn) {
    await awardPetXp(coupleId, `duo-${view.week.completedOn}`, DUO_WEEK_XP);
  }

  // Every rung, not just the one they landed on: a phone that was offline
  // across two thresholds should collect both.
  for (const tier of tiersReached(view.points)) {
    await awardPetXp(coupleId, `tier-${tier.n}`, tier.xp);
  }
}
