import type { DayKey } from '../types';
import type { LifeEvent, LifeEventKind, Payout } from './types';

/**
 * Life events grant; they never take.
 *
 * The point of a hard day being in the game at all is to make the hard day cost
 * less, not to reward having one. So every grant here is weighted toward
 * **energy** — the spendable pool that gets the pet out the door tonight — and
 * away from **XP**, which is progression. A hard day should refill you, not
 * advance you; if a bad week levelled you faster than a good one, the game
 * would be quietly asking for bad weeks.
 *
 * The tests pin that: for every restorative kind, energy exceeds XP, and XP
 * stays below what a single hard task pays.
 */
export const LIFE_EVENT_GRANTS: Record<LifeEventKind, Payout> = {
  // The largest energy grant. A cycle does not care what was on the list.
  'period-start': { xp: 2, coins: 4, energy: 20, mp: 6 },
  'sick-day': { xp: 2, coins: 3, energy: 18, mp: 5 },
  'hard-day': { xp: 2, coins: 3, energy: 14, mp: 4 },
  // From your partner, so it carries a little more XP: the one grant you cannot
  // give yourself is the one worth a nudge of progression.
  'good-vibes': { xp: 4, coins: 2, energy: 10, mp: 3 },
  // Not restorative — an anniversary, a first, a thing you finished together.
  milestone: { xp: 40, coins: 20, energy: 10, mp: 5 },
};

/** Sending is worth something too, or nobody sends. Finch's friend feature. */
export const GOOD_VIBES_SENDER_GRANT: Payout = { xp: 2, coins: 1, energy: 2, mp: 1 };

export const LIFE_EVENT_LINES: Record<LifeEventKind, string> = {
  'period-start': 'Day one. The list can wait; here is some energy instead.',
  'sick-day': 'Rest is the task today. Nothing else is owed.',
  'hard-day': 'Logged as a hard one. That is allowed, and it costs you nothing.',
  'good-vibes': 'Someone who lives with you thought of you just now.',
  milestone: 'Worth marking. This one goes in the record.',
};

export const LIFE_EVENT_NAMES: Record<LifeEventKind, string> = {
  'period-start': 'Period start',
  'sick-day': 'Sick day',
  'hard-day': 'Hard day',
  'good-vibes': 'Good Vibes',
  milestone: 'Milestone',
};

export function grantFor(kind: LifeEventKind): Payout {
  return LIFE_EVENT_GRANTS[kind];
}

/**
 * Restorative kinds are claimed once per day per person: a second sick-day
 * button press should not be a second refill. Good Vibes is the exception —
 * it comes from the other person, so it is capped per sender instead.
 */
export const ONCE_PER_DAY: LifeEventKind[] = ['period-start', 'sick-day', 'hard-day'];

export const GOOD_VIBES_PER_SENDER_PER_DAY = 3;

export function alreadyClaimed(
  events: LifeEvent[],
  kind: LifeEventKind,
  memberId: string,
  day: DayKey,
): boolean {
  if (!ONCE_PER_DAY.includes(kind)) return false;
  return events.some((e) => e.kind === kind && e.memberId === memberId && e.day === day);
}

export function goodVibesSentToday(
  events: LifeEvent[],
  fromMemberId: string,
  day: DayKey,
): number {
  return events.filter(
    (e) => e.kind === 'good-vibes' && e.fromMemberId === fromMemberId && e.day === day,
  ).length;
}

export function canSendGoodVibes(
  events: LifeEvent[],
  fromMemberId: string,
  day: DayKey,
): boolean {
  return goodVibesSentToday(events, fromMemberId, day) < GOOD_VIBES_PER_SENDER_PER_DAY;
}

/**
 * Whether a grant may be made at all. Returns the reason when it may not, so
 * the UI can say it plainly rather than showing a dead button.
 */
export function checkGrant(
  events: LifeEvent[],
  kind: LifeEventKind,
  memberId: string,
  day: DayKey,
  fromMemberId?: string,
): { ok: true } | { ok: false; reason: string } {
  if (kind === 'good-vibes') {
    if (!fromMemberId) return { ok: false, reason: 'Good Vibes come from the other person.' };
    if (fromMemberId === memberId) {
      return { ok: false, reason: 'Good Vibes are for the other person, not for yourself.' };
    }
    if (!canSendGoodVibes(events, fromMemberId, day)) {
      return {
        ok: false,
        reason: `That is ${GOOD_VIBES_PER_SENDER_PER_DAY} today — they keep their weight by being rare.`,
      };
    }
    return { ok: true };
  }
  if (alreadyClaimed(events, kind, memberId, day)) {
    return { ok: false, reason: 'Already logged today. It only counts once.' };
  }
  return { ok: true };
}
