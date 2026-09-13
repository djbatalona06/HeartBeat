import type { DayKey, MemberId } from '../types';
import { addDays, daysBetween } from '../day';
import { isDuoDay } from './vitals';

/**
 * The three things a couple gets for continuing to show up: a week where you
 * both did, a way back after a week where neither of you did, and a ladder that
 * remembers all of it.
 *
 * Everything here is *derived* from the same day log `vitals.ts` walks — the one
 * both phones already reconcile. That is not a shortcut, it is the mechanic's
 * only honest shape in this app, for the reason the banner in `vitals.ts` gives
 * at length: a stored counter is a number two phones can disagree about, and
 * the one that disagrees is always the one on screen. A rolling window and a
 * running total have nothing to reset, nothing for a cron job to own, and no
 * second copy to drift.
 *
 * It also settles the rule this repository keeps: **nothing here subtracts.**
 * A missed day means a total does not go up. There is no field on any type
 * below that could carry a penalty, and `together.test.ts` pins that by walking
 * a couple through a fortnight of silence and asserting no number came out
 * smaller than it went in.
 *
 * Pure. `db/repository/together.ts` does the Dexie reads and the paying.
 */

/* ---- the duo week --------------------------------------------------------- */

/**
 * Seven days, ending today.
 *
 * A *rolling* window rather than a cycle with a stored start date. The obvious
 * shape is "the Worker opens a cycle on Monday and resets it on Sunday", and
 * that shape needs a table, a cron job, and an agreement between two phones
 * about which week it currently is — three things to get wrong in service of a
 * number both devices can already compute from data they hold. It is also
 * kinder: there is no Sunday night on which a part-finished week is taken away.
 */
export const DUO_WINDOW_DAYS = 7;

/** What a completed week pays into the shared pet. Larger than a quest at
 *  `easy` and smaller than one at `hard`: seven days of both of you is real
 *  work, and it should not out-earn the thing you chose to take on. */
export const DUO_WEEK_XP = 120;

export interface DuoDay {
  day: DayKey;
  /** Both of you logged something. */
  duo: boolean;
}

export interface DuoWeek {
  /** Oldest first, today last. Always exactly `DUO_WINDOW_DAYS` long. */
  days: DuoDay[];
  /** How many of the seven had both of you on them. */
  duoDays: number;
  bothToday: boolean;
  /** Every day in the window. What pays. */
  complete: boolean;
  /** The day a complete week landed on — today — or null. The award id is
   *  built from this, so settling the same week twice pays once. */
  completedOn: DayKey | null;
}

export function duoWeek(
  members: ReadonlyMap<DayKey, ReadonlySet<MemberId>>,
  today: DayKey,
): DuoWeek {
  const days: DuoDay[] = [];
  for (let back = DUO_WINDOW_DAYS - 1; back >= 0; back -= 1) {
    const day = addDays(today, -back);
    const seen = members.get(day);
    days.push({ day, duo: seen ? isDuoDay(seen) : false });
  }

  const duoDays = days.filter((d) => d.duo).length;
  const complete = duoDays === DUO_WINDOW_DAYS;

  return {
    days,
    duoDays,
    bothToday: days[days.length - 1].duo,
    complete,
    completedOn: complete ? today : null,
  };
}

/* ---- coming back ---------------------------------------------------------- */

/**
 * How long since either of you logged anything, and whether that is long enough
 * to offer a way back in.
 *
 * Three days rather than one, because two quiet days is a weekend and being
 * asked about it would be nagging. The offer is an offer: nothing expires,
 * nothing was lost while they were away, and the copy on the quest says so.
 */
export const REUNION_AFTER_DAYS = 3;

export interface Reunion {
  /** Days since the last thing either of you logged. 0 when that was today. */
  awayDays: number;
  /** True once the gap is wide enough to put the reunion quest on the board. */
  offered: boolean;
}

export function reunion(
  members: ReadonlyMap<DayKey, ReadonlySet<MemberId>>,
  today: DayKey,
): Reunion {
  // Days ahead of today — a phone in another timezone, a clock set forward —
  // are ignored rather than counted as "logged today", the same rule
  // `vitalsOf` applies to the glow.
  let lastLogged: DayKey | null = null;
  for (const day of members.keys()) {
    if (daysBetween(day, today) < 0) continue;
    if (lastLogged === null || day > lastLogged) lastLogged = day;
  }

  // A couple who have never logged anything are not coming *back* from
  // anywhere, and greeting them with "welcome back" on day one would be the
  // app inventing a history they do not have.
  if (lastLogged === null) return { awayDays: 0, offered: false };

  const awayDays = Math.max(0, daysBetween(lastLogged, today));
  return { awayDays, offered: awayDays >= REUNION_AFTER_DAYS };
}

/* ---- the Together tier ---------------------------------------------------- */

/**
 * What the ladder counts. Every one of these is a lifetime total that can only
 * grow, which is what makes a tier something you cannot fall out of — the same
 * property achievements have, and obtained the same way rather than by a rule
 * somewhere promising not to take one back.
 */
export interface LoyaltyInput {
  /** Person-days: one per member per day they logged anything. */
  loggedDays: number;
  /** Days you both did. */
  duoDays: number;
  /** Quests carried to completion, ever. */
  questsFinished: number;
  /** XP from achievements unlocked, ever. */
  achievementXp: number;
}

export const POINTS_PER_LOGGED_DAY = 2;
/** Worth more than the two logs that make it, for the reason `TOGETHER_BOND`
 *  is the largest number in `vitals.ts`: the best thing either of you can do
 *  for this is the other one opening the app. */
export const POINTS_PER_DUO_DAY = 5;
export const POINTS_PER_QUEST = 25;
export const ACHIEVEMENT_XP_PER_POINT = 2;

export function loyaltyPoints(input: LoyaltyInput): number {
  return (
    Math.max(0, input.loggedDays) * POINTS_PER_LOGGED_DAY
    + Math.max(0, input.duoDays) * POINTS_PER_DUO_DAY
    + Math.max(0, input.questsFinished) * POINTS_PER_QUEST
    + Math.floor(Math.max(0, input.achievementXp) / ACHIEVEMENT_XP_PER_POINT)
  );
}

export interface TogetherTier {
  /** Position on the ladder. 0 is where everybody starts. */
  n: number;
  name: string;
  /** Points needed to reach it. */
  at: number;
  blurb: string;
  /** Paid into the shared pet, once, on arrival. */
  xp: number;
}

/**
 * Five rungs, each roughly twice the last.
 *
 * The escalation is the point — a ladder whose rungs pay the same amount stops
 * being a ladder around the third one. At a pace of both partners logging daily
 * this is about a fortnight to Steady, six weeks to Woven, three months to
 * Rooted and most of a year to Evergreen, which is the right shape for an app
 * meant to still be installed next winter.
 *
 * Named for what a couple looks like rather than for metals. Nobody wants to be
 * told they are Bronze.
 */
export const TOGETHER_TIERS: readonly TogetherTier[] = [
  { n: 0, name: 'New', at: 0, blurb: 'Two phones, one pet. Start anywhere.', xp: 0 },
  { n: 1, name: 'Steady', at: 150, blurb: 'A fortnight of showing up.', xp: 60 },
  { n: 2, name: 'Woven', at: 500, blurb: 'Long enough that it is a habit now.', xp: 140 },
  { n: 3, name: 'Rooted', at: 1200, blurb: 'A season of the two of you.', xp: 300 },
  { n: 4, name: 'Evergreen', at: 2600, blurb: 'Still here, still both of you.', xp: 600 },
];

export function tierAt(points: number): TogetherTier {
  let here = TOGETHER_TIERS[0];
  for (const tier of TOGETHER_TIERS) if (points >= tier.at) here = tier;
  return here;
}

/** The next rung, or undefined at the top. */
export function nextTier(points: number): TogetherTier | undefined {
  return TOGETHER_TIERS.find((tier) => tier.at > points);
}

/** Points still to go, or 0 at the top. */
export function pointsToNext(points: number): number {
  const next = nextTier(points);
  return next ? next.at - points : 0;
}

/**
 * Every tier reached at this many points, lowest first.
 *
 * Settlement pays from this rather than from `tierAt` alone: a phone that was
 * offline across two thresholds should collect both, not just the one it
 * landed on.
 */
export function tiersReached(points: number): TogetherTier[] {
  return TOGETHER_TIERS.filter((tier) => tier.n > 0 && points >= tier.at);
}
