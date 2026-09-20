import { startOfWeek } from '../day';
import type { CoupleId, DayKey, MemberId, Wager } from '../types';

/**
 * The weekly wager, as arithmetic.
 *
 * Pure: no Dexie, no React, no clock except through the arguments. The
 * repository decides when to write; this decides what is true.
 *
 * The shape follows `domain/quests/engine.ts` deliberately — `reckon` returning
 * a verb the caller switches on, a settled row refusing to settle twice — so
 * there is one way a timed shared goal works in this app rather than two.
 */

/** What a couple may aim for in a week, each. */
export const WAGER_TARGETS = [2, 3, 4, 5] as const;

export type WagerTarget = (typeof WAGER_TARGETS)[number];

/**
 * Pet XP staked per workout in the target.
 *
 * Multiplied rather than a flat number, so aiming at five is worth more than
 * aiming at two and nobody is better off lowballing. Tuned against
 * `QUEST_DIAL` — a steady quest pays 130 over a week — so a wager sits in the
 * same range rather than becoming the only thing worth doing.
 */
export const STAKE_PER_WORKOUT = 22;

export function stakeFor(target: number): number {
  return Math.round(target * STAKE_PER_WORKOUT);
}

export function isWagerTarget(value: number): value is WagerTarget {
  return (WAGER_TARGETS as readonly number[]).includes(value);
}

/**
 * The id for a couple's week.
 *
 * Derived rather than random, which is the whole reason two phones cannot end
 * up holding two wagers for one week: both compute this and the upsert
 * converges. See the note on `Wager`.
 */
export function wagerIdFor(coupleId: CoupleId, weekStart: DayKey): string {
  return `wager-${coupleId}-${weekStart}`;
}

export function newWager(input: {
  coupleId: CoupleId;
  /** Any day in the week being staked; normalised to its Monday. */
  day: DayKey;
  target: number;
  now: number;
}): Wager {
  const weekStart = startOfWeek(input.day);
  return {
    id: wagerIdFor(input.coupleId, weekStart),
    coupleId: input.coupleId,
    weekStart,
    target: input.target,
    stake: stakeFor(input.target),
    updatedAt: input.now,
  };
}

/** The last day the wager covers. */
export function endOfWager(wager: Pick<Wager, 'weekStart'>): DayKey {
  const [y, m, d] = wager.weekStart.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  at.setUTCDate(at.getUTCDate() + 6);
  return at.toISOString().slice(0, 10);
}

/** Whether a day falls inside the week this wager covers. */
export function coversDay(wager: Pick<Wager, 'weekStart'>, day: DayKey): boolean {
  return day >= wager.weekStart && day <= endOfWager(wager);
}

/** How many workouts each member managed inside the week. */
export type WagerCounts = Readonly<Record<MemberId, number>>;

export interface WagerStanding {
  memberId: MemberId;
  done: number;
  /** Reached the target. */
  met: boolean;
  /** How many more this person needs. Never negative. */
  short: number;
}

/**
 * Where each of them stands.
 *
 * `members` is passed rather than taken from the keys of `counts`, and that is
 * load-bearing: a member who has not trained at all has no row to count, so
 * reading the keys would quietly drop them and the wager would read as met by
 * everybody who happened to show up. The two people are a fact about the
 * couple, not about the exercise table.
 */
export function standingsOf(
  wager: Pick<Wager, 'target'>,
  members: readonly MemberId[],
  counts: WagerCounts,
): WagerStanding[] {
  return members.map((memberId) => {
    const done = counts[memberId] ?? 0;
    return {
      memberId,
      done,
      met: done >= wager.target,
      short: Math.max(0, wager.target - done),
    };
  });
}

export type WagerStep =
  /** Paid already. Nothing further to do, ever. */
  | { verb: 'settled'; met: boolean }
  /** Both of them reached it. `award` is the stake, to be paid once. */
  | { verb: 'won'; award: number }
  /** The week is over and they did not. Nothing is taken. */
  | { verb: 'missed' }
  /** Still live. `short` is how many workouts remain across both of them. */
  | { verb: 'running'; short: number };

/**
 * What to do about a wager right now.
 *
 * ## It pays the moment they both arrive, not on Sunday night
 *
 * Waiting for the week to end would mean the reward landing in a different
 * week from the effort, and on a Monday morning, which is the least
 * interesting moment it could arrive. The quest engine pays on completion for
 * the same reason.
 *
 * ## A settled wager refuses to settle again
 *
 * This is the pay-once guard, and it lives here rather than at the call site
 * because there are two callers — the screen that shows the standing and the
 * reconciliation that pays — and only one of them would have remembered.
 * `Quest.completedAt` does the same job; `settledAt` is its counterpart, and
 * the award id the repository uses is derived from the wager's own id so that
 * even a double call cannot double-credit.
 */
export function reckonWager(
  wager: Wager,
  members: readonly MemberId[],
  counts: WagerCounts,
  today: DayKey,
): WagerStep {
  if (wager.settledAt !== undefined) return { verb: 'settled', met: wager.met === true };

  const standings = standingsOf(wager, members, counts);
  // An empty member list cannot be "everybody met it". Vacuous truth here
  // would pay a wager out on a device that has not learned who the couple are
  // yet, which on a fresh install is the first thing that happens.
  if (standings.length > 0 && standings.every((s) => s.met)) {
    return { verb: 'won', award: wager.stake };
  }

  if (today > endOfWager(wager)) return { verb: 'missed' };

  return { verb: 'running', short: standings.reduce((n, s) => n + s.short, 0) };
}

/** Stamped as paid. Pure, so the repository writes what this returns. */
export function markSettled(wager: Wager, met: boolean, at: number): Wager {
  return { ...wager, settledAt: at, met, updatedAt: at };
}

/** Days left in the week, inclusive of today. Zero once it is over. */
export function daysLeft(wager: Pick<Wager, 'weekStart'>, today: DayKey): number {
  const end = endOfWager(wager);
  if (today > end) return 0;
  const at = (s: DayKey) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const from = today < wager.weekStart ? wager.weekStart : today;
  return Math.round((at(end) - at(from)) / 86_400_000) + 1;
}
