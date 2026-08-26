import type { Quest } from './types';

/**
 * Levelling curve. Each level costs a little more than the last, so early
 * levels arrive fast enough to be worth chasing and later ones still mean
 * something. Thresholds are cumulative XP.
 */
export const BASE_COST = 100;
export const GROWTH = 1.35;

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let n = 1; n < level; n += 1) total += Math.round(BASE_COST * GROWTH ** (n - 1));
  return total;
}

export function levelForXp(xp: number): number {
  if (xp <= 0) return 1;
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  into: number;
  needed: number;
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const needed = ceiling - floor;
  const into = xp - floor;
  return { level, into, needed, fraction: needed === 0 ? 1 : into / needed };
}

/** A quest pays out only once, on the transition to complete. */
export function questComplete(quest: Quest): boolean {
  return quest.progress >= quest.target;
}

export function awardFor(quests: Quest[]): number {
  return quests.filter(questComplete).reduce((sum, q) => sum + q.xp, 0);
}
