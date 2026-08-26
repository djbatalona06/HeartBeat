/**
 * The boss maths, server side.
 *
 * This is deliberately a second copy of `app/src/domain/rpg/boss.ts`: the two
 * halves are separate npm workspaces with separate builds, and the alternative
 * — the Worker importing across the workspace boundary — would drag the app's
 * module graph into a Worker bundle for four constants.
 *
 * The copy is kept honest rather than trusted. Both `boss.test.ts` files pin
 * the same table of exact numbers for tiers 1 through 5, so a change made to
 * one side and not the other fails CI here rather than desyncing quietly in
 * front of two people mid-fight.
 */

export const BASE_HP = 600;
export const BASE_DMG = 18;
export const TIER_STEP = 1.25;

/** Seven days to finish a tier. Long enough that a bad week is not a defeat. */
export const FIGHT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * No single blow may take more than a quarter of the bar. The client computes
 * damage from stats it also stores, so this is the one number the server will
 * not take on trust — not because either of them would cheat, but because a
 * bug that sends `NaN` or `1e9` should cost a turn, not the whole fight.
 */
export const MAX_BLOW_FRACTION = 0.25;

export type BossState = 'gathering' | 'fighting' | 'won' | 'lost';

export function tierScale(tier: number): number {
  return TIER_STEP ** (Math.max(1, Math.floor(tier)) - 1);
}

export function bossMaxHp(tier: number): number {
  return Math.round(BASE_HP * tierScale(tier));
}

export function bossDamage(tier: number): number {
  return Math.round(BASE_DMG * tierScale(tier));
}

/** Escalation on victory only. */
export function nextTier(tier: number, won: boolean): number {
  return won ? Math.max(1, Math.floor(tier)) + 1 : Math.max(1, Math.floor(tier));
}

/** A blow the server will accept: a finite, positive, capped integer. */
export function clampBlow(damage: unknown, maxHp: number): number {
  const value = typeof damage === 'number' && Number.isFinite(damage) ? Math.floor(damage) : 0;
  if (value <= 0) return 0;
  return Math.min(value, Math.max(1, Math.floor(maxHp * MAX_BLOW_FRACTION)));
}

/**
 * Record a member as ready. Returns null when the slots are already filled or
 * this member has already said it, so a double tap is a no-op rather than the
 * second person.
 */
export function readySlots(
  current: { ready_a: string | null; ready_b: string | null },
  memberId: string,
): { ready_a: string | null; ready_b: string | null } | null {
  if (current.ready_a === memberId || current.ready_b === memberId) return null;
  if (!current.ready_a) return { ready_a: memberId, ready_b: current.ready_b };
  if (!current.ready_b) return { ready_a: current.ready_a, ready_b: memberId };
  return null;
}

export function bothReady(row: { ready_a: string | null; ready_b: string | null }): boolean {
  return Boolean(row.ready_a && row.ready_b);
}
