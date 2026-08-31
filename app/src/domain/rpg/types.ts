import type { CoupleId, DayKey, MemberId } from '../types';

/**
 * The RPG layer: Habitica's skeleton wearing Finch's manner.
 *
 * Habitica gamifies achievement and charges you health for a missed Daily.
 * Finch gamifies self-compassion and lets the bird wait. Everything else in the
 * two designs composes; that one does not, and HeartBeat is for two people who
 * live together, so Habitica's cron damage would mean one partner's bad week
 * damages the other.
 *
 * The ruling, enforced by the shapes in this file: **health exists only inside
 * a boss fight.** In daily life there is no bar to lose. Miss a day and the
 * boss takes no damage that day — absence of progress, never a penalty. No type
 * outside `BossFight` carries a health field, so no later edit can add a cost
 * to ordinary life without first changing this file.
 */

export type TaskType = 'habit' | 'daily' | 'todo';

/**
 * Habitica's four difficulties and its four weights. The weight scales what a
 * task pays; it deliberately does not scale how fast its value drifts, because
 * drift measures habituation and habituation is about frequency, not effort.
 */
export type TaskDifficulty = 'trivial' | 'easy' | 'medium' | 'hard';

export const DIFFICULTY_WEIGHT: Record<TaskDifficulty, number> = {
  trivial: 0.1,
  easy: 1,
  medium: 1.5,
  hard: 2,
};

export interface Task {
  id: string;
  coupleId: CoupleId;
  /** Tasks belong to one person. The pet they feed is shared. */
  memberId: MemberId;
  type: TaskType;
  title: string;
  notes?: string;
  difficulty: TaskDifficulty;
  /**
   * Habitica's task value, clamped to ±VALUE_CLAMP. Rises as the task is done
   * and falls as it is left, and what it pays rides the curve in `task.ts`.
   */
  value: number;
  /** Consecutive completions. A counter to look at, never a multiplier. */
  streak: number;
  /** Weekdays a Daily is due, 0 = Sunday. Undefined or empty means every day. */
  dueDays?: number[];
  lastCompletedOn?: DayKey;
  /**
   * The last day already judged for a missed Daily. Walking forward from here
   * is what keeps drift idempotent: opening the app twice in one evening must
   * not count the same missed day twice.
   */
  lastSettledOn?: DayKey;
  /** To-dos only: a to-do is done once and then archived rather than reset. */
  done?: boolean;
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * What a task pays. XP and coins ride the value curve; energy and MP do not —
 * see the note on `payoutFor` in `task.ts`.
 */
export interface Payout {
  xp: number;
  coins: number;
  energy: number;
  mp: number;
}

export const EMPTY_PAYOUT: Payout = { xp: 0, coins: 0, energy: 0, mp: 0 };

/**
 * Four stats, and no classes. Habitica's classes are good design for a party of
 * six, where the fun is that the healer cannot tank. For a party of two they
 * mean one person's build can lock the other out of a boss, and there is nobody
 * else to call — so all four rise together with level.
 */
export type StatKey = 'strength' | 'insight' | 'heart' | 'luck';

export interface Stats {
  /** Damage in a boss fight. */
  strength: number;
  /** Maximum MP. */
  insight: number;
  /** Maximum energy, and how much of a hit the party absorbs. */
  heart: number;
  /** Nudges pet and gear drop rarity. Never nudges a payout. */
  luck: number;
}

/**
 * Five worn slots, head to foot with the hand last.
 *
 * `head`, `body` and `charm` were the earlier names for `helmet`, `chestplate`
 * and `amulet`; stored avatars still carry those keys, and `normalizeGear` in
 * `gear.ts` is what makes an old row readable. Item ids were left alone through
 * the rename precisely so nothing had to be re-keyed twice.
 */
export type GearSlot = 'helmet' | 'chestplate' | 'boots' | 'amulet' | 'weapon';

export const GEAR_SLOTS: GearSlot[] = ['helmet', 'chestplate', 'boots', 'amulet', 'weapon'];

export interface Avatar {
  memberId: MemberId;
  coupleId: CoupleId;
  /**
   * Level and stats are derived from this and never stored. A stored level is a
   * second copy of the XP that can disagree with it, and the one that disagrees
   * is always the one on screen.
   */
  xp: number;
  coins: number;
  energy: number;
  mp: number;
  /** One gear id per slot. Unequipped slots are simply absent. */
  gear: Partial<Record<GearSlot, string>>;
  /** The pet walking with you. Its own MP bar rides on this choice. */
  companionId?: string;
  updatedAt: number;
}

export function newAvatar(memberId: MemberId, coupleId: CoupleId, at: number): Avatar {
  return { memberId, coupleId, xp: 0, coins: 0, energy: 0, mp: 0, gear: {}, updatedAt: at };
}

/** Finch's growth stages, in order. */
export type StageId =
  | 'egg'
  | 'hatchling'
  | 'fledgling'
  | 'youngling'
  | 'companion'
  | 'guardian';

export interface Stage {
  id: StageId;
  name: string;
  /** Reached at this level and held until the next stage's level. */
  minLevel: number;
  /** Energy an adventure costs. Rises with the stage, as Finch's does. */
  energyCost: number;
  /** How long that adventure takes. Falls with the stage, as Finch's does. */
  adventureHours: number;
  /** The energy ceiling at this stage, before the heart stat adds to it. */
  baseMaxEnergy: number;
  /** One line, shown when the stage is reached. */
  blurb: string;
}

/**
 * Something true about the day that the game should meet gently. A life event
 * grants; it never takes.
 */
export type LifeEventKind =
  | 'period-start'
  | 'sick-day'
  | 'hard-day'
  | 'good-vibes'
  | 'milestone';

export interface LifeEvent {
  id: string;
  coupleId: CoupleId;
  /** Who receives the grant. */
  memberId: MemberId;
  kind: LifeEventKind;
  day: DayKey;
  /** Good Vibes only: who sent it, and what they wrote. */
  fromMemberId?: MemberId;
  note?: string;
  grantedAt: number;
}

/** Something to buy with coins. Deliberately whatever the two of you decide. */
export interface Reward {
  id: string;
  coupleId: CoupleId;
  /** Unset means either of you can redeem it. */
  memberId?: MemberId;
  title: string;
  notes?: string;
  cost: number;
  createdAt: number;
  updatedAt: number;
}

/** A redemption is a record, not a mutation of the reward. */
export interface Redemption {
  id: string;
  coupleId: CoupleId;
  memberId: MemberId;
  rewardId: string;
  title: string;
  cost: number;
  day: DayKey;
  redeemedAt: number;
}
