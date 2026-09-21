import { BADGE_ROUTES, type Badge, type BadgeKey } from './derive';
import type { WagerStep } from '../wager/engine';

/**
 * Everything worth one line at the top of the screen, and which one gets it.
 *
 * ## What this replaced
 *
 * `headline()` returned the **first** of quests and cheers and silently
 * dropped the other. With two things waiting, the second was invisible until
 * the first was dealt with — and the wager, which shipped with nothing
 * surfacing it anywhere, was not in the list at all. One line is still right;
 * one line that pretends to be the only thing waiting is not.
 *
 * So this collects what is waiting, keeps the header at one line, and says how
 * many are behind it.
 *
 * ## Still one counter
 *
 * `deriveBadges` is the only thing that counts. This takes its output and
 * turns it into sentences — it never reads the tables itself. Two counters
 * over the same rows drift, and the dot on the tab bar disagreeing with the
 * bar at the top is the specific failure `derive.test.ts` walks every source
 * file to prevent.
 *
 * ## Which notices can be waved away
 *
 * Not all of them, and that is the whole reason `clears` exists rather than an
 * × on every line.
 *
 * `NotificationHeader` argued at length that it should have no dismiss button,
 * because quests are deliberately not watermarked: a finished quest clears by
 * being *claimed*, so a "seen" stamp would hide a payout nobody has taken.
 * That argument is right and it still stands — for quests. What it was
 * over-applying is the conclusion. A payout you earned is **owed** to you and
 * only claiming it should clear it; a cheer is already watermarked and clears
 * by being looked at; but the wager line is neither. It is news, it is not
 * actionable, and a person who has read it should be able to put it away.
 *
 * So `clears: 'claiming'` means the line goes when you deal with the thing,
 * and `clears: 'dismissing'` means it also carries an ×. Nothing that is owed
 * to somebody is ever dismissible.
 *
 * ## What is deliberately not here
 *
 * A **missed** wager. The week ran out and nothing was taken — `reckonWager`
 * says so — and putting "you did not manage it" across the top of every
 * screen is exactly the deficit this layer was shaped to make impossible.
 * `schedule.ts` argues it about push and `derive.ts` about badges: nothing
 * here exists to tell somebody they are behind. A quiet week simply does not
 * pay.
 */

export type NoticeKind = 'quest' | 'cheer' | 'wager';

/** How a notice stops being shown. */
export type NoticeClears = 'claiming' | 'dismissing';

export interface Notice {
  /**
   * Stable for as long as the news is the same, and different when it changes.
   *
   * That is what makes dismissal safe: dismissing "three days left" hides
   * that, and tomorrow's "two days left" is a different id and comes back. A
   * single id per kind would silence the line forever after one tap.
   */
  id: string;
  kind: NoticeKind;
  /** One sentence. Present tense, and about the good thing that happened. */
  text: string;
  /** Where tapping goes. */
  to: string;
  clears: NoticeClears;
}

/** This week's wager, reduced to what a sentence needs. */
export interface WagerNotice {
  /** The row's own id, so a dismissal is about this week and not all weeks. */
  id: string;
  step: WagerStep;
  target: number;
  /** Inclusive of today, from `daysLeft`. */
  daysLeft: number;
}

export interface NoticeInput {
  /** Straight from `deriveBadges`. Never recounted here. */
  badges: Record<BadgeKey, Badge>;
  wager?: WagerNotice | null;
}

function questText(n: number): string {
  return n === 1
    ? 'A quest is finished. The payout is waiting.'
    : `${n} quests are finished. The payouts are waiting.`;
}

function cheerText(n: number): string {
  return n === 1
    ? 'They cheered something you logged.'
    : `They cheered ${n} things you logged.`;
}

/**
 * Plain words for the small numbers a week can have left in it.
 *
 * Capitalised because this is the start of the sentence — every other line the
 * header can show is a proper sentence, and one that opens lowercase reads as
 * a fragment next to them.
 */
const DAYS = ['No days', 'One day', 'Two days', 'Three days', 'Four days', 'Five days', 'Six days', 'Seven days'];

function wagerNotice(wager: WagerNotice): Notice | null {
  const { step } = wager;

  if (step.verb === 'won') {
    return {
      id: `wager:${wager.id}:won`,
      kind: 'wager',
      text: `The week is yours. ${step.award} XP to the birb.`,
      to: '/exercise',
      clears: 'dismissing',
    };
  }

  if (step.verb === 'running') {
    const left = DAYS[wager.daysLeft] ?? `${wager.daysLeft} days`;
    return {
      // Keyed on the days left, so it says today's number once and returns
      // tomorrow with a different one rather than being silenced for the week.
      id: `wager:${wager.id}:d${wager.daysLeft}`,
      kind: 'wager',
      text: `${left} left on the ${wager.target}-workout week.`,
      to: '/exercise',
      clears: 'dismissing',
    };
  }

  // `settled` is finished business and `missed` is not news this app delivers.
  return null;
}

/**
 * What is waiting, most-owed first.
 *
 * Quests, then cheers, then the wager: what the app owes you, then what your
 * partner gave you, then what it is telling you. That is the order
 * `HEADLINE_KEYS` already read in, kept because it is the right one — a payout
 * should not queue behind a progress note.
 */
export function notices(input: NoticeInput): Notice[] {
  const out: Notice[] = [];

  const quests = input.badges.quests;
  const questRoute = BADGE_ROUTES.quests;
  if (quests && quests.count > 0 && questRoute) {
    out.push({
      id: `quest:${quests.count}`,
      kind: 'quest',
      text: questText(quests.count),
      to: questRoute,
      clears: 'claiming',
    });
  }

  const cheers = input.badges.cheers;
  const cheerRoute = BADGE_ROUTES.cheers;
  if (cheers && cheers.count > 0 && cheerRoute) {
    out.push({
      id: `cheer:${cheers.count}`,
      kind: 'cheer',
      text: cheerText(cheers.count),
      to: cheerRoute,
      clears: 'claiming',
    });
  }

  if (input.wager) {
    const line = wagerNotice(input.wager);
    if (line) out.push(line);
  }

  return out;
}

export interface Rollup {
  /** The one that gets the line. */
  lead: Notice;
  /** How many more are waiting behind it. Zero when it is the only one. */
  more: number;
}

/**
 * The lead notice and a count of the rest, or nothing at all.
 *
 * Dismissed ids are dropped **before** the lead is chosen, so waving away a
 * wager note promotes whatever was behind it rather than leaving the bar
 * showing a line somebody has already put away.
 *
 * Only notices that `clears: 'dismissing'` can be dismissed. A dismissed id
 * for a claiming notice is ignored rather than honoured — otherwise a stale
 * `dismissedNotifications` entry from a future version could hide a payout,
 * and hiding a payout is the one thing this must never do.
 */
export function rollup(
  list: readonly Notice[],
  dismissed: readonly string[] = [],
): Rollup | null {
  const gone = new Set(dismissed);
  const live = list.filter(
    (notice) => notice.clears !== 'dismissing' || !gone.has(notice.id),
  );
  if (live.length === 0) return null;
  return { lead: live[0], more: live.length - 1 };
}

/**
 * Whether the header has anything to say.
 *
 * The same question `rollup` answers, named for the caller that only wants the
 * yes or no — a shell deciding whether to reserve the line at all.
 */
export function shouldShowHeader(
  list: readonly Notice[],
  dismissed: readonly string[] = [],
): boolean {
  return rollup(list, dismissed) !== null;
}

/**
 * Keep the dismissal list from growing without bound.
 *
 * Ids are per-state — `quest:3`, `wager:abc:d4` — so the set a device
 * accumulates is unbounded over a year of weeks, and it is stored in Settings
 * and synced. Only ids still live can matter, so everything else is dropped on
 * the way in.
 */
export function pruneDismissed(
  list: readonly Notice[],
  dismissed: readonly string[],
): string[] {
  const live = new Set(list.map((notice) => notice.id));
  return dismissed.filter((id) => live.has(id));
}
