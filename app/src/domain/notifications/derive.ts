import { reckon } from '../quests/engine';
import type { DayKey, Quest } from '../types';
import type { Cheer } from '../rpg/types';

/**
 * Everything in the app that is allowed to wear a dot.
 *
 * ## The rule this file exists to enforce
 *
 * `ui/BadgeDot.tsx` states it and cannot enforce it: **no component computes
 * its own dot.** Every badge in the app is an entry here, derived from synced
 * state by one pure function, or it does not exist.
 *
 * The one badge that shipped before this broke that rule in the way the rule
 * predicts. `ChatPanel` counted unread messages against a `useRef(0)`, so it
 * was right until you reloaded the page and then it was zero — three messages
 * waiting and nothing on screen. Nobody would write that deliberately; it is
 * what a count invented at the point of display grows into.
 *
 * ## Waiting, never missed
 *
 * The first of the three traps this overhaul is gated on is gamified anxiety,
 * and a badge is where it gets in. Each of the three below is somebody or
 * something *offering* you an item:
 *
 * - **messages** — they wrote to you.
 * - **cheers** — they saw a thing you logged and said so.
 * - **quests** — you already finished it; the payout has not been taken.
 *
 * None of them is "you did not log yesterday", and none ever will be. That is
 * a scold with a red circle on it, and `domain/notify/schedule.ts` already
 * argues the same line about push. A dot you cannot clear by *doing something
 * nice* is a dot that makes the app feel like a debt.
 *
 * The test for a new key is not "is there data for it" — it is "would a person
 * be glad to see this". A count of undone dailies has data behind it and fails
 * that question flat.
 *
 * ## Why a watermark and not a flag per row
 *
 * A `seenAt` per key, compared against each row's own timestamp. The
 * alternative — an `unread` boolean on every message and cheer — is a write
 * per row on a table that syncs between two phones, which means two devices
 * disagreeing about what you have read and a merge rule for it. A watermark is
 * one number, it is idempotent, and the worst a stale one can do is show a dot
 * for something already seen. The reverse failure, hiding something that is
 * genuinely waiting, is the one that matters, and a watermark cannot cause it.
 */
export const BADGE_KEYS = ['messages', 'cheers', 'quests'] as const;

export type BadgeKey = (typeof BADGE_KEYS)[number];

/**
 * Where a badge sends you.
 *
 * `messages` has no route on purpose: the thread is a sheet over whatever
 * screen you are on, reached from a pill above the tab bar rather than by
 * navigating — see `ChatPanel`'s header for why it is not a tab. `byRoute`
 * below skips it rather than inventing one.
 */
export const BADGE_ROUTES: Partial<Record<BadgeKey, string>> = {
  cheers: '/friends',
  quests: '/quests',
};

export interface Badge {
  key: BadgeKey;
  /** How many are waiting. Never negative; zero means no dot at all. */
  count: number;
  /** What is waiting, in words, for a screen reader. */
  label: string;
}

/** Just enough of a message to decide whether it is waiting. */
export interface BadgeMessage {
  mine: boolean;
  createdAt: number;
}

export interface BadgeInput {
  /** This device's member, which is whose cheers do *not* count. */
  memberId: string;
  today: DayKey;
  /**
   * The last time each surface was actually looked at.
   *
   * Missing means never looked, which correctly badges everything on a fresh
   * install with history already synced from the other phone.
   */
  seen: Partial<Record<BadgeKey, number>>;
  messages: readonly BadgeMessage[];
  cheers: readonly Cheer[];
  quests: readonly Quest[];
}

/** Plural that reads like a person wrote it. */
function count(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/**
 * Every badge, including the empty ones.
 *
 * Empty ones are returned rather than filtered so a caller cannot tell the
 * difference between "no dot" and "this key does not exist" — the second is a
 * typo, and silently rendering nothing is how a typo survives. `BadgeDot`
 * already renders nothing for a zero.
 */
export function deriveBadges(input: BadgeInput): Record<BadgeKey, Badge> {
  const { memberId, today, seen, messages, cheers, quests } = input;

  const since = (key: BadgeKey) => seen[key] ?? 0;

  // Theirs, and newer than the last look. `mine` is the field the thread
  // already carries; deriving it from `memberId` here would be a second
  // definition of whose message it is.
  const unread = messages.filter((m) => !m.mine && m.createdAt > since('messages')).length;

  // A cheer this device's member left on their partner's event is not news to
  // them. `canCheer` already refuses the self case, but a badge that trusts
  // another module's guard is a badge that lights up the day that guard moves.
  const cheered = cheers.filter(
    (c) => c.memberId !== memberId && c.createdAt > since('cheers'),
  ).length;

  // `reckon` rather than reading `completedAt`: it is the one definition of
  // what a finished quest is, it refuses a quest that already paid, and it
  // puts expiry behind completion so a quest finished on its last day counts.
  // A quest whose target is met and whose award is untaken is the purest
  // waiting there is — the work is done and the app owes you.
  const ready = quests.filter((q) => reckon(q, today).verb === 'complete').length;

  return {
    messages: {
      key: 'messages',
      count: unread,
      label: count(unread, 'unread message', 'unread messages'),
    },
    cheers: {
      key: 'cheers',
      count: cheered,
      // "cheer" rather than "reaction": it is what the button says, and a
      // screen reader should hear the same word the screen shows.
      label: count(cheered, 'new cheer', 'new cheers'),
    },
    quests: {
      key: 'quests',
      // Not "unclaimed" — that implies you are late. You finished it.
      count: ready,
      label: count(ready, 'quest finished', 'quests finished'),
    },
  };
}

/**
 * The same badges keyed by route, which is what the tab bar wants.
 *
 * Summed rather than overwritten, so two keys pointing at one tab add up
 * instead of one of them silently winning — which is the bug that shape
 * invites, and it would be invisible until the second key was added.
 */
export function byRoute(badges: Record<BadgeKey, Badge>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of BADGE_KEYS) {
    const to = BADGE_ROUTES[key];
    if (!to || badges[key].count <= 0) continue;
    out[to] = (out[to] ?? 0) + badges[key].count;
  }
  return out;
}

/**
 * The one thing worth a line across the top of the screen, or nothing.
 *
 * ## Why this is not a fourth badge key
 *
 * A dot says "there is something here". A sentence across the top of every
 * screen says "read this now", and that is a louder instrument. So it is
 * deliberately not its own count derived from its own data: it only ever
 * restates a badge that already exists, which means it inherits the rule the
 * badge list is built on — every one of them is somebody *offering* you
 * something, never the app noting what you did not do. A header that said "you
 * have not logged since Tuesday" is the single easiest way to turn this app
 * into a debt, and the way to make that impossible is to give the header no
 * source of truth of its own.
 *
 * ## Why messages are left out
 *
 * They have a surface already: a pill above the tab bar that opens the thread
 * as a sheet over whatever screen you are on. `BADGE_ROUTES` records the same
 * fact by giving `messages` no route. Saying it twice would not make an unread
 * message easier to find; it would make the header something people learn to
 * ignore, and then the quest payout goes unread too.
 *
 * So: only the keys that have somewhere to send you, in the order of what the
 * app owes you versus what it is telling you.
 */
export const HEADLINE_KEYS: readonly BadgeKey[] = ['quests', 'cheers'];

export interface Headline {
  /** Which badge this restates, so dismissing it marks the right thing seen. */
  key: BadgeKey;
  /** One sentence. Present tense, and about the good thing that happened. */
  text: string;
  /** Where tapping goes. Always set — `HEADLINE_KEYS` only holds routed keys. */
  to: string;
}

/**
 * What each key says when it is the one being shown.
 *
 * Bespoke rather than reusing `Badge.label`: "3 quests finished" is right for a
 * screen reader announcing a dot and wrong as a sentence, and bending one
 * string to do both jobs is how the dot ends up reading like a headline or the
 * headline like a label.
 */
function headlineText(key: BadgeKey, n: number): string {
  if (key === 'quests') {
    return n === 1
      ? 'A quest is finished. The payout is waiting.'
      : `${n} quests are finished. The payouts are waiting.`;
  }
  return n === 1
    ? 'They cheered something you logged.'
    : `They cheered ${n} things you logged.`;
}

export function headline(badges: Record<BadgeKey, Badge>): Headline | null {
  for (const key of HEADLINE_KEYS) {
    const badge = badges[key];
    const to = BADGE_ROUTES[key];
    // `to` cannot be missing for these two, and is checked anyway: the day
    // somebody adds a routeless key to the list above, this shows nothing
    // rather than rendering a bar that goes nowhere when tapped.
    if (!to || badge.count <= 0) continue;
    return { key, text: headlineText(key, badge.count), to };
  }
  return null;
}
