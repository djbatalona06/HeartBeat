import { hash } from '../hash';
import type { DayKey } from '../types';
import type { Avatar } from './types';

/**
 * The ways coins arrive as something you hold, rather than as a number that
 * simply went up.
 *
 * Pure. The Dexie half is `db/repository/coinSources.ts`.
 *
 * **Purses are found, never sold.** Everything in the shop is priced in coins,
 * so a purse that could be bought for fewer coins than it opens for would be a
 * machine, and one that cost more would be a button nobody pressed. They come
 * from a login award, a first boss clear done together, and the loot a boss
 * drops when you go back to it.
 */

/* -- purses ------------------------------------------------------------------ */

export const PURSE_PREFIX = 'purse-';

export interface Purse {
  id: string;
  name: string;
  /** What it opens for. */
  coins: number;
}

export const PURSES: readonly Purse[] = [
  { id: 'purse-small', name: 'Small purse', coins: 40 },
  { id: 'purse-fat', name: 'Fat purse', coins: 110 },
  { id: 'purse-hoard', name: 'Hoard', coins: 260 },
];

export function purseById(id: string): Purse | undefined {
  return PURSES.find((purse) => purse.id === id);
}

export function isPurseItem(itemId: string): boolean {
  return itemId.startsWith(PURSE_PREFIX);
}

/**
 * The inventory row id for a purse. Deterministic from where it came from, so a
 * grant that is retried, or reported by a re-run of the same win, is the same
 * row and not a second purse.
 */
export function purseRowId(memberId: string, source: string): string {
  return `${PURSE_PREFIX}${memberId}-${source}`;
}

export function unopened<T extends { itemId: string; openedAt?: number }>(rows: readonly T[]): T[] {
  return rows.filter((row) => isPurseItem(row.itemId) && row.openedAt === undefined);
}

/* -- the seven-day login award ------------------------------------------------ */

export const LOGIN_CYCLE = 7;

export interface LoginReward {
  coins: number;
  purse?: string;
}

/** Day seven is the one worth coming back for. */
export const LOGIN_REWARDS: readonly LoginReward[] = [
  { coins: 10 }, { coins: 15 }, { coins: 20 }, { coins: 25 },
  { coins: 35 }, { coins: 50 }, { coins: 60, purse: 'purse-fat' },
];

export interface LoginState {
  /** False once today's has been taken. */
  claimable: boolean;
  /** 1 to 7: which award is next. */
  day: number;
  reward: LoginReward;
}

type LoginFields = Pick<Avatar, 'loginClaims' | 'lastLoginDay'>;

/**
 * Where a member stands in the cycle.
 *
 * Counted in claims, not in consecutive days: a week the app was shut costs
 * nothing, because nothing in HeartBeat takes something away for a quiet
 * fortnight. The only rule is one per day, in the member's own timezone.
 */
export function loginState(avatar: LoginFields, today: DayKey): LoginState {
  const claims = Math.max(0, Math.floor(avatar.loginClaims ?? 0)) % LOGIN_CYCLE;
  return {
    claimable: avatar.lastLoginDay !== today,
    day: claims + 1,
    reward: LOGIN_REWARDS[claims],
  };
}

/**
 * Whether the login popup is on screen.
 *
 * Open while today's award is unclaimed, unless it was put off *today* -- put
 * off is per day, so tomorrow's offer comes back on its own -- and held open
 * after a claim for as long as the receipt is being looked at, because
 * claiming makes `claimable` false and would otherwise close it mid-sentence.
 */
export function loginPopupOpen(input: {
  claimable: boolean;
  day: DayKey;
  putOffOn: DayKey | null;
  showingReceipt: boolean;
}): boolean {
  return input.showingReceipt || (input.claimable && input.putOffOn !== input.day);
}

export function claimLogin(
  avatar: Avatar,
  today: DayKey,
  at: number,
): { avatar: Avatar; reward: LoginReward; day: number } | null {
  const state = loginState(avatar, today);
  if (!state.claimable) return null;
  return {
    avatar: {
      ...avatar,
      coins: avatar.coins + state.reward.coins,
      loginClaims: state.day % LOGIN_CYCLE,
      lastLoginDay: today,
      updatedAt: at,
    },
    reward: state.reward,
    day: state.day,
  };
}

/* -- the garden --------------------------------------------------------------- */

const STAGE_BASE = [4, 4, 5, 10, 5, 14, 30] as const;

/**
 * Coins for a member's first clear of a garden stage. Rises a quarter per
 * island, so the far islands pay for being far.
 */
export function stageCoins(island: number, stage: number): number {
  const base = STAGE_BASE[Math.min(STAGE_BASE.length, Math.max(1, stage)) - 1];
  return Math.round(base * (1 + 0.25 * (Math.max(1, island) - 1)));
}

/** Boss replays that drop loot, per member per day. Past this the fight is still allowed, just plain. */
export const REPLAY_DAILY_CAP = 3;

export interface Loot {
  coins: number;
  purse?: string;
}

/**
 * What a boss you have already beaten drops when you go back to it.
 *
 * Rolled from the member, monster, day and drop number rather than from a
 * clock, so a retried write rolls the same result and a refresh cannot re-roll
 * a bad one into a good one.
 */
export function replayLoot(memberId: string, monsterId: string, island: number, day: DayKey, n: number): Loot {
  const coins = Math.max(1, Math.round(stageCoins(island, 7) / 2));
  const roll = (hash(`${memberId}/${monsterId}/${day}/${n}`) % 1000) / 1000;
  if (island >= 5 && roll < 0.1) return { coins, purse: 'purse-fat' };
  if (roll < 0.25) return { coins, purse: 'purse-small' };
  return { coins };
}

/** Whether this member's replay allowance for `day` is spent, and the count to write back. */
export function replayAllowance(
  avatar: Pick<Avatar, 'replayDay' | 'replayCount'>,
  day: DayKey,
): { left: number; used: number } {
  const used = avatar.replayDay === day ? Math.max(0, avatar.replayCount ?? 0) : 0;
  return { left: Math.max(0, REPLAY_DAILY_CAP - used), used };
}

/* -- the overworld ------------------------------------------------------------ */

/** The trickle for beating something you have beaten before: a quarter of its bounty, at least 1. */
export const REPEAT_WIN_DAILY_CAP = 40;

export function repeatWinCoins(
  bounty: number,
  avatar: Pick<Avatar, 'foeCoinsDay' | 'foeCoinsPaid'>,
  day: DayKey,
): number {
  const paid = avatar.foeCoinsDay === day ? Math.max(0, avatar.foeCoinsPaid ?? 0) : 0;
  return Math.max(0, Math.min(Math.max(1, Math.round(bounty / 4)), REPEAT_WIN_DAILY_CAP - paid));
}
