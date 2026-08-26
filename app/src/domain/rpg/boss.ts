import type { Stats } from './types';
import type { SkillEffect } from './skills';

/**
 * The boss fight — the one place in HeartBeat where health exists.
 *
 * Everywhere else the ruling holds: no bar to lose, no cost for a missed day.
 * Here there is a bar, because here it is a thing the two of you walked into
 * together and can walk out of. A defeat costs the fight, not the week.
 *
 * The authoritative HP lives in D1 (`worker/migrations/0003_boss.sql`), because
 * boss HP is contested state and two phones each subtracting damage under
 * last-write-wins would silently discard one player's hits. This module holds
 * the maths both sides agree on; `worker/src/boss.ts` carries the same table of
 * numbers and its tests pin the same values, so a change to one that is not
 * made to the other fails CI rather than desyncing quietly.
 */

export const BASE_HP = 600;
export const BASE_DMG = 18;

/** Each cleared tier is 25% more of everything. Never a different number. */
export const TIER_STEP = 1.25;

export function tierScale(tier: number): number {
  return TIER_STEP ** (Math.max(1, Math.floor(tier)) - 1);
}

export function bossMaxHp(tier: number): number {
  return Math.round(BASE_HP * tierScale(tier));
}

/** What the boss hits back for. The number the party's health is measured in. */
export function bossDamage(tier: number): number {
  return Math.round(BASE_DMG * tierScale(tier));
}

/**
 * Escalation on victory only. A defeat re-runs the same tier: losing should
 * mean the fight is still there, not that it grew while you were down.
 */
export function nextTier(tier: number, won: boolean): number {
  return won ? Math.max(1, Math.floor(tier)) + 1 : Math.max(1, Math.floor(tier));
}

/**
 * The reward for clearing a tier is a better chance at the tail of the drop
 * table — a 20% lift at tier 1, climbing 2 points a tier and stopping at 30%.
 * Capped because an uncapped multiplier eventually makes godly the common case
 * and the sixteen pets stop being sixteen different feelings.
 */
export const MIN_VICTORY_BONUS = 0.2;
export const MAX_VICTORY_BONUS = 0.3;
export const VICTORY_BONUS_PER_TIER = 0.02;

export function victoryDropBonus(tier: number): number {
  const t = Math.max(1, Math.floor(tier));
  return Math.min(MAX_VICTORY_BONUS, MIN_VICTORY_BONUS + (t - 1) * VICTORY_BONUS_PER_TIER);
}

/** A plain hit. Strength is the only stat that reaches it. */
export const HIT_BASE = 6;
export const HIT_PER_STRENGTH = 1.5;

export function plainHit(stats: Stats): number {
  return Math.round(HIT_BASE + Math.max(0, stats.strength) * HIT_PER_STRENGTH);
}

export interface Blow {
  damage: number;
  shield: number;
  heal: number;
  energy: number;
}

/**
 * One attack, optionally carrying a skill — yours, your companion's, or both.
 * Damage multipliers compose multiplicatively; the flat effects add. A blow
 * with no skill attached is simply the plain hit.
 */
export function resolveBlow(stats: Stats, effects: SkillEffect[] = []): Blow {
  let multiplier = 1;
  let shield = 0;
  let heal = 0;
  let energy = 0;
  for (const effect of effects) {
    if (effect.damage !== undefined) multiplier *= effect.damage;
    shield += effect.shield ?? 0;
    heal += effect.heal ?? 0;
    energy += effect.energy ?? 0;
  }
  return { damage: Math.round(plainHit(stats) * multiplier), shield, heal, energy };
}

export type BossState = 'gathering' | 'fighting' | 'won' | 'lost';

export interface BossView {
  tier: number;
  hp: number;
  maxHp: number;
  state: BossState;
  readyA: boolean;
  readyB: boolean;
}

export function hpFraction(view: Pick<BossView, 'hp' | 'maxHp'>): number {
  if (view.maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, view.hp / view.maxHp));
}

/**
 * Both ready before it starts. One person cannot drag the other into a fight
 * they would both wear — the server enforces it too, but saying it here means
 * the button can explain itself instead of just refusing.
 */
export function canStart(view: Pick<BossView, 'readyA' | 'readyB' | 'state'>): boolean {
  return view.state === 'gathering' && view.readyA && view.readyB;
}

export function waitingOn(view: Pick<BossView, 'readyA' | 'readyB' | 'state'>): string | null {
  if (view.state !== 'gathering') return null;
  if (view.readyA && view.readyB) return null;
  if (!view.readyA && !view.readyB) return 'Neither of you has said ready yet.';
  return 'Waiting on the other half of the couple.';
}

/** How many plain hits a tier takes, for the "is this a reasonable fight" read. */
export function hitsToClear(tier: number, stats: Stats): number {
  return Math.ceil(bossMaxHp(tier) / Math.max(1, plainHit(stats)));
}
