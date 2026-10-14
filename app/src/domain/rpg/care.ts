import type { DayKey, MemberId } from '../types';
import { addDays } from '../day';

/**
 * Looking after the shared pet: feeding it, and the three small rituals.
 *
 * Two things live here and they are deliberately built from the same row, a
 * `CareAct`, because both are the same gesture -- one of you doing something
 * kind for the pet -- and one synced kind is one set of sync edits, not two.
 *
 * ## Feeding
 *
 * Food is **earned by logging, and never by waiting.** A mood check-in that says
 * you ate well earns a *meal*, a logged workout earns a *snack*, and a grateful
 * check-in earns a *treat*. There is no hunger bar and no timer: nothing here
 * drains, so there is nothing to fall behind on. A pet that has not been fed
 * today is `peckish`, never sad -- the same rule `vitals.ts` holds for the glow.
 *
 * **The pantry is derived, not counted.** Items are rebuilt from the day log both
 * phones already reconcile, and what has been fed is the set of `CareAct`s. An
 * item is available while no act names it. A stored counter would need the award
 * queue, dedup list and server-side merge that `Pet.xp` needed; this needs none,
 * because two phones that feed the same item land on the same *key* and the
 * pantry counts keys, not rows.
 *
 * **Either of you can feed an item the other earned.** An act records who fed
 * (`memberId`, the row's only writer) and whose item it was (`earnerId`). That
 * is the whole of "feeding for each other", and it is why the act id includes
 * the feeder: both holdings rules need a row to have exactly one writer, so two
 * partners feeding the same item write two rows and the pantry reads them as
 * one fed item.
 *
 * ## Rituals
 *
 * Pet, play and rest: once a day each, per person, free. When *both* of you do
 * the same one on the same day the pet answers with something bigger -- the one
 * place the cooperative premise is spelled out in a gesture. They pay nothing:
 * evolution is gated by habits in `vitals.ts`, and a button that could be
 * pressed instead of logging would quietly replace the thing the app is for.
 *
 * Pure, and ignorant of Dexie: `db/repository/care.ts` reads and writes.
 */

export type FeedKind = 'meal' | 'snack' | 'treat';
export type RitualKind = 'pet' | 'play' | 'rest';
export type CareKind = FeedKind | RitualKind;

export const FEED_KINDS: readonly FeedKind[] = ['meal', 'snack', 'treat'];
export const RITUAL_KINDS: readonly RitualKind[] = ['pet', 'play', 'rest'];

export function isFeedKind(kind: CareKind): kind is FeedKind {
  return (FEED_KINDS as readonly string[]).includes(kind);
}

export interface CareAct {
  /** Derived, never minted -- see `feedActId` and `ritualActId`. */
  id: string;
  coupleId: string;
  /** Who did it, and the row's only writer for life. */
  memberId: MemberId;
  kind: CareKind;
  /** The day it was done, in the doer's own timezone. */
  day: DayKey;
  /** Feeding only: whose logging earned the item. May be someone else. */
  earnerId?: MemberId;
  /** Feeding only: the day the item was earned, which can be yesterday. */
  earnedDay?: DayKey;
  createdAt: number;
  /** The wire stamp. Equal to `createdAt` and never rewritten. */
  updatedAt: number;
}

/* -- food ------------------------------------------------------------------- */

export interface FoodInfo {
  name: string;
  /** "a proper meal" -- reads after "fed it". */
  phrase: string;
  earnedBy: string;
}

export const FOOD: Record<FeedKind, FoodInfo> = {
  meal: {
    name: 'Meal',
    phrase: 'a proper meal',
    earnedBy: 'Tick "ate well" on a mood check-in',
  },
  snack: {
    name: 'Snack',
    phrase: 'a snack',
    earnedBy: 'Log a workout',
  },
  treat: {
    name: 'Treat',
    phrase: 'a treat',
    earnedBy: 'Tick "grateful" on a mood check-in',
  },
};

/**
 * Each companion's favourite. Character, not statistics -- the same line
 * `companionSkills.ts` draws -- so the only thing it changes is a reaction.
 * Keyed by theme id, since that is how a member's mascot is stored.
 */
export const FAVOURITE_FOOD: Record<string, FeedKind> = {
  pony: 'treat',
  avatar: 'meal',
  sponge: 'snack',
  kitty: 'treat',
  shinobi: 'snack',
};

export function favouriteFor(themeId: string | undefined): FeedKind {
  return (themeId && FAVOURITE_FOOD[themeId]) || 'meal';
}

/** How far back an uneaten item stays in the pantry, today included. */
export const PANTRY_DAYS = 2;

/** What an item needs to be earned: one member's one day of logging. */
export interface MoodLike {
  memberId: MemberId;
  day: DayKey;
  ateWell?: boolean;
  grateful?: boolean;
}

export interface ExerciseLike {
  memberId: MemberId;
  day: DayKey;
}

export interface FoodItem {
  /** The pantry key, shared by every act that eats this item. */
  key: string;
  kind: FeedKind;
  earnerId: MemberId;
  earnedDay: DayKey;
}

export function foodKey(kind: FeedKind, earnerId: MemberId, earnedDay: DayKey): string {
  return `${earnedDay}:${kind}:${earnerId}`;
}

/**
 * Everything the last `PANTRY_DAYS` days of logging has earned, fed or not.
 *
 * A window rather than "today": a couple who log at breakfast and open the pet
 * after midnight should not find the meal gone. Two days is as generous as is
 * still a pantry rather than a hoard.
 */
export function earnedFood(
  moods: readonly MoodLike[],
  exercises: readonly ExerciseLike[],
  today: DayKey,
): FoodItem[] {
  const earliest = addDays(today, -(PANTRY_DAYS - 1));
  const inWindow = (day: DayKey) => day >= earliest && day <= today;
  const seen = new Map<string, FoodItem>();
  const add = (kind: FeedKind, earnerId: MemberId, earnedDay: DayKey) => {
    const key = foodKey(kind, earnerId, earnedDay);
    if (!seen.has(key)) seen.set(key, { key, kind, earnerId, earnedDay });
  };

  for (const mood of moods) {
    if (!inWindow(mood.day)) continue;
    if (mood.ateWell) add('meal', mood.memberId, mood.day);
    if (mood.grateful) add('treat', mood.memberId, mood.day);
  }
  for (const exercise of exercises) {
    if (inWindow(exercise.day)) add('snack', exercise.memberId, exercise.day);
  }
  return [...seen.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The pantry key a feeding act ate, or undefined for an act that is not one. */
export function keyOfFeed(act: CareAct): string | undefined {
  if (!isFeedKind(act.kind) || !act.earnerId || !act.earnedDay) return undefined;
  return foodKey(act.kind, act.earnerId, act.earnedDay);
}

/** Derived from the item and the feeder, so the same tap twice is one row. */
export function feedActId(item: FoodItem, feederId: MemberId): string {
  return `feed:${item.key}:${feederId}`;
}

/** Items still waiting to be fed: earned, and named by no act. */
export function pantryOf(items: readonly FoodItem[], acts: readonly CareAct[]): FoodItem[] {
  const eaten = new Set<string>();
  for (const act of acts) {
    const key = keyOfFeed(act);
    if (key) eaten.add(key);
  }
  return items.filter((item) => !eaten.has(item.key));
}

export type FeedCheck = { ok: true } | { ok: false; reason: string };

/**
 * May this member feed this item?
 *
 * Yes whoever earned it -- that is the feature. The only refusal is an item
 * already eaten, and it is a gentle one: two phones tapping at once is normal.
 */
export function canFeed(item: FoodItem, acts: readonly CareAct[]): FeedCheck {
  const eaten = pantryOf([item], acts).length === 0;
  return eaten ? { ok: false, reason: 'That one has already been eaten.' } : { ok: true };
}

/* -- the sentence ----------------------------------------------------------- */

/**
 * One line saying who fed what, from the viewer's side.
 *
 * Four cases and they read differently: you fed your own, you fed theirs (the
 * kindest), they fed yours, they fed theirs. "They" is the neutral word the
 * rest of the app uses for the partner.
 */
export function describeFeed(act: CareAct, viewerId: MemberId): string | undefined {
  if (!isFeedKind(act.kind) || !act.earnerId) return undefined;
  const food = FOOD[act.kind].phrase;
  const mine = act.memberId === viewerId;
  const ownItem = act.earnerId === act.memberId;
  if (mine && ownItem) return `You fed it ${food}.`;
  if (mine) return `You fed it ${food} they had earned.`;
  if (ownItem) return `They fed it ${food}.`;
  return `They fed it ${food} you had earned.`;
}

/** The latest feeding in a set of acts, newest first. */
export function feedsNewestFirst(acts: readonly CareAct[]): CareAct[] {
  return acts.filter((a) => isFeedKind(a.kind)).sort((a, b) => b.createdAt - a.createdAt);
}

export type Appetite = 'fed' | 'peckish';

/**
 * Whether anything has been fed today.
 *
 * `peckish` is the whole of the pet's "hungry": a pose, not a penalty. Nothing
 * reads it except the drawing and the line of copy under it.
 */
export function appetiteOf(acts: readonly CareAct[], today: DayKey): Appetite {
  return acts.some((a) => isFeedKind(a.kind) && a.day === today) ? 'fed' : 'peckish';
}

/**
 * Whether the companion got its favourite today, which is a reaction and
 * nothing else.
 */
export function gotFavourite(
  acts: readonly CareAct[],
  today: DayKey,
  themeId: string | undefined,
): boolean {
  const want = favouriteFor(themeId);
  return acts.some((a) => a.kind === want && a.day === today);
}

/* -- rituals ---------------------------------------------------------------- */

export interface Ritual {
  id: RitualKind;
  name: string;
  /** What the button says, in the present tense. */
  verb: string;
  /** What it tells the pet, in a few words. */
  blurb: string;
  /** The pet attribute it leans towards in the drawing, not in any total. */
  leans: 'vitality' | 'serenity' | 'bond';
}

export const RITUALS: readonly Ritual[] = [
  { id: 'pet', name: 'Pet', verb: 'Give it a pet', blurb: 'A slow stroke, and it leans in.', leans: 'bond' },
  { id: 'play', name: 'Play', verb: 'Play with it', blurb: 'Chase, flap, repeat.', leans: 'vitality' },
  { id: 'rest', name: 'Rest', verb: 'Tuck it in', blurb: 'Lights low, nothing to do.', leans: 'serenity' },
];

export function ritualById(id: RitualKind): Ritual | undefined {
  return RITUALS.find((r) => r.id === id);
}

/** One per person per ritual per day -- the same tap twice is the same row. */
export function ritualActId(kind: RitualKind, day: DayKey, memberId: MemberId): string {
  return `ritual:${day}:${kind}:${memberId}`;
}

export interface RitualState {
  ritual: Ritual;
  /** Distinct members who did it today. */
  doneBy: MemberId[];
  /** This device's member has already done it. */
  mine: boolean;
  /** Everyone in the couple did it: the pet's bigger answer. */
  together: boolean;
}

/**
 * Where each ritual stands today.
 *
 * `together` needs to know the couple's size, so the caller passes the member
 * ids it knows about. A solo phone (no partner yet) can never be `together`,
 * which is honest: the reaction is for two.
 */
export function ritualStates(
  acts: readonly CareAct[],
  today: DayKey,
  memberId: MemberId,
  coupleMembers: readonly MemberId[],
): RitualState[] {
  return RITUALS.map((ritual) => {
    const who = new Set<MemberId>();
    for (const act of acts) {
      if (act.kind === ritual.id && act.day === today) who.add(act.memberId);
    }
    const doneBy = [...who];
    const everyone = coupleMembers.length >= 2 && coupleMembers.every((m) => who.has(m));
    return { ritual, doneBy, mine: who.has(memberId), together: everyone };
  });
}

/**
 * Days on which both of you looked after the pet in some way -- fed, petted,
 * played, rested -- as a lifetime total that can only grow.
 *
 * Shown, not paid: it is the number behind "you looked after it together", and
 * keeping it out of `vitals.ts` keeps the stage gates reading only the logs.
 */
export function togetherCareDays(acts: readonly CareAct[]): number {
  const byDay = new Map<DayKey, Set<MemberId>>();
  for (const act of acts) {
    const who = byDay.get(act.day) ?? new Set<MemberId>();
    who.add(act.memberId);
    byDay.set(act.day, who);
  }
  let days = 0;
  for (const who of byDay.values()) if (who.size >= 2) days += 1;
  return days;
}

/**
 * One line for the pet's idle caption, from today's care.
 *
 * Never accusing: an unfed, unpetted pet is "peckish" and "waiting", and a
 * fully cared-for one is simply content.
 */
export function careCaption(
  appetite: Appetite,
  ritualsTogether: number,
  ateFavourite: boolean,
): string {
  if (ateFavourite) return 'That was exactly what it wanted.';
  if (ritualsTogether > 0) return 'You both showed up for it. It noticed.';
  return appetite === 'fed' ? 'Fed, and content.' : 'A little peckish. No rush.';
}
