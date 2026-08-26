import { levelForXp, levelProgress, type LevelProgress } from '../xp';
import { stageForLevel } from './stage';
import type { Avatar, Payout, Stage, Stats } from './types';

/**
 * The character sheet, all of it derived.
 *
 * **Level and stats are never stored.** A stored level is a second copy of the
 * XP that can disagree with it, and the one that disagrees is always the one on
 * screen. The only numbers an avatar row holds are the ones nothing else can
 * reconstruct: XP, coins, and the two spendable pools.
 *
 * **There are no classes.** All four stats rise together. Habitica's classes
 * are good design for a party of six, where the fun is that the healer cannot
 * tank; for a party of two they mean one person's build can lock the other out
 * of a boss, and there is nobody else to call.
 */

export const STAT_PER_LEVEL = 1;

/** Deliberately reuses the existing curve rather than starting a second one. */
export function levelOf(avatar: Pick<Avatar, 'xp'>): number {
  return levelForXp(avatar.xp);
}

export function progressOf(avatar: Pick<Avatar, 'xp'>): LevelProgress {
  return levelProgress(avatar.xp);
}

export const ZERO_STATS: Stats = { strength: 0, insight: 0, heart: 0, luck: 0 };

export function addStats(a: Stats, b: Partial<Stats>): Stats {
  return {
    strength: a.strength + (b.strength ?? 0),
    insight: a.insight + (b.insight ?? 0),
    heart: a.heart + (b.heart ?? 0),
    luck: a.luck + (b.luck ?? 0),
  };
}

/** Every level is worth the same to every stat. That is the no-classes rule. */
export function baseStats(level: number): Stats {
  const value = 1 + Math.max(0, level - 1) * STAT_PER_LEVEL;
  return { strength: value, insight: value, heart: value, luck: value };
}

export function statsFor(level: number, bonus: Partial<Stats> = {}): Stats {
  return addStats(baseStats(level), bonus);
}

export const MP_BASE = 10;
export const MP_PER_INSIGHT = 3;
export const ENERGY_PER_HEART = 2;

export function maxMp(stats: Stats): number {
  return MP_BASE + stats.insight * MP_PER_INSIGHT;
}

export function maxEnergy(stage: Stage, stats: Stats): number {
  return stage.baseMaxEnergy + stats.heart * ENERGY_PER_HEART;
}

export interface Sheet {
  level: number;
  progress: LevelProgress;
  stats: Stats;
  stage: Stage;
  energy: number;
  maxEnergy: number;
  mp: number;
  maxMp: number;
  coins: number;
}

/**
 * Everything the UI needs about a person, in one pass. `bonus` is whatever gear
 * and a companion add; keeping it a parameter is what lets this module stay
 * ignorant of both.
 */
export function sheetFor(avatar: Avatar, bonus: Partial<Stats> = {}): Sheet {
  const level = levelOf(avatar);
  const stats = statsFor(level, bonus);
  const stage = stageForLevel(level);
  const energyCeiling = maxEnergy(stage, stats);
  const mpCeiling = maxMp(stats);
  return {
    level,
    progress: progressOf(avatar),
    stats,
    stage,
    energy: Math.min(avatar.energy, energyCeiling),
    maxEnergy: energyCeiling,
    mp: Math.min(avatar.mp, mpCeiling),
    maxMp: mpCeiling,
    coins: avatar.coins,
  };
}

/**
 * Credit a payout. Energy and MP fill to their ceiling and stop; XP and coins
 * have no ceiling. Nothing here can subtract — a payout has no negative branch,
 * which is the daily-life half of the health ruling.
 */
export function applyPayout(avatar: Avatar, payout: Payout, at: number): Avatar {
  const xp = avatar.xp + Math.max(0, payout.xp);
  // The ceilings move with the level the new XP buys, so a payout that levels
  // you up can also fill the larger bar it just unlocked.
  const level = levelForXp(xp);
  const stats = baseStats(level);
  const energyCeiling = maxEnergy(stageForLevel(level), stats);
  const mpCeiling = maxMp(stats);
  return {
    ...avatar,
    xp,
    coins: avatar.coins + Math.max(0, payout.coins),
    energy: Math.min(energyCeiling, avatar.energy + Math.max(0, payout.energy)),
    mp: Math.min(mpCeiling, avatar.mp + Math.max(0, payout.mp)),
    updatedAt: at,
  };
}

export interface SpendRequest {
  energy?: number;
  mp?: number;
  coins?: number;
}

export function canSpend(avatar: Avatar, cost: SpendRequest): boolean {
  return (
    avatar.energy >= (cost.energy ?? 0)
    && avatar.mp >= (cost.mp ?? 0)
    && avatar.coins >= (cost.coins ?? 0)
  );
}

/**
 * Returns null rather than a partially-paid avatar when the cost cannot be met.
 * A caller that ignores the null gets no change at all, which is the safe way
 * for this to fail.
 */
export function spend(avatar: Avatar, cost: SpendRequest, at: number): Avatar | null {
  if (!canSpend(avatar, cost)) return null;
  return {
    ...avatar,
    energy: avatar.energy - (cost.energy ?? 0),
    mp: avatar.mp - (cost.mp ?? 0),
    coins: avatar.coins - (cost.coins ?? 0),
    updatedAt: at,
  };
}
