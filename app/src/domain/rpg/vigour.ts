import { addStats } from './avatar';
import type { Stats } from './types';
import { RADIANCE_FLOOR, RADIANCE_FULL, type Vitals } from './vitals';

/**
 * What the last few days of logging are worth in a fight.
 *
 * This is the inbound half of the coupling between the wellness log and the
 * overworld, and it has exactly one rule that matters more than the numbers:
 *
 * **Nothing here is ever negative.** There is no multiplier below 1, no stat
 * penalty, no HP taken away, no decay. A week where neither of you logged
 * anything produces a bonus of zero, and a good week produces a bonus on top of
 * it. That asymmetry is the whole design: the floor is the plain fight, and
 * logging can only ever raise you off it.
 *
 * Stated precisely, because the imprecise version is easy to believe and wrong:
 * the guarantee is that **the first foe in a zone is winnable at level 1 with a
 * bonus of zero** (`enemies.test.ts` pins it), and that vigour never turns a
 * fight you could win into one you cannot. It is *not* a promise that every foe
 * is beatable the moment you can walk up to it — the wasp at the far end of the
 * garden wants either a few levels or a good week behind you, and that is
 * ordinary progression rather than a penalty. Walking away is always free, and
 * `'down'` costs nothing, so meeting something too big is a detour, not a loss.
 *
 * `boss.ts` states the ruling this obeys: "no bar to lose, no cost for a missed
 * day". A vigour system that scaled stats *down* would satisfy the letter of
 * that (no bar is literally lost) while breaking its spirit, because a stressful
 * fortnight would quietly become a fortnight of losing fights. `vitals.ts` makes
 * the same argument about the glow and reaches the same shape: a floor that is
 * never fallen through. This module is that floor applied to combat, which is
 * why it reads `radiance` rather than recomputing anything — the clamp at
 * `RADIANCE_FLOOR` is already the guarantee, and borrowing it is cheaper and
 * harder to get wrong than a second clamp of our own.
 *
 * The player-facing consequence, which is the actual deliverable: a tired week
 * reads as "no wind at your back", not "you have been penalised". It names an
 * absence, it never names which of the two of you was absent, and the fight it
 * describes is still one you win.
 */

/** The most any single stat is lifted, at full radiance. */
export const MAX_VIGOUR = 3;

/** Encounter HP added per day of shared streak, and where it stops. */
export const HP_PER_STREAK_DAY = 2;
export const MAX_STREAK_HP = 20;

export interface Vigour {
  /** Added to the sheet's stats for this encounter only. Never negative. */
  bonus: Stats;
  /** Added to encounter HP. Never negative. */
  hpBonus: number;
  /** One line, second person, shown above the bars. Never names a partner. */
  note: string;
  /** True when the bonus is nothing. For wording and styling, never arithmetic. */
  plain: boolean;
}

/**
 * How far above the floor the glow is sitting, as 0..1.
 *
 * `radianceFor` already clamps to `[RADIANCE_FLOOR, RADIANCE_FULL]`, so this
 * cannot go negative however stale the log is. That is the safety argument, and
 * it is one line of reuse rather than a clamp this module would have to keep in
 * step with that one.
 */
export function liftOf(radiance: number): number {
  const span = RADIANCE_FULL - RADIANCE_FLOOR;
  const above = Math.min(RADIANCE_FULL, Math.max(RADIANCE_FLOOR, radiance)) - RADIANCE_FLOOR;
  return span <= 0 ? 0 : above / span;
}

function noteFor(bonus: number, hpBonus: number): string {
  if (bonus <= 0 && hpBonus <= 0) {
    // The important one. An absence, not an accusation, and not a warning.
    return 'No wind at your back today. The garden is still the garden.';
  }
  if (bonus <= 0) return `A streak behind you: +${hpBonus} to your bar.`;
  if (hpBonus <= 0) return `Something logged recently: +${bonus} to everything.`;
  if (bonus >= MAX_VIGOUR) {
    return `Both of you have been showing up. +${bonus} to everything, and +${hpBonus} to your bar.`;
  }
  return `+${bonus} to everything, and +${hpBonus} to your bar.`;
}

/**
 * The bonus a fight starts with, from the vitals the dashboard already computes.
 *
 * Takes `Vitals` rather than a day log because `coupleVitals(day)` is already
 * called on every screen that needs it and walks the log once; asking for the
 * log here would mean a second walk to derive two numbers that are already on
 * the object.
 */
export function vigourOf(vitals: Vitals): Vigour {
  const lift = liftOf(vitals.radiance);
  const step = Math.round(lift * MAX_VIGOUR);
  const bonus = { strength: step, insight: step, heart: step, luck: step };
  const hpBonus = Math.min(MAX_STREAK_HP, Math.max(0, vitals.streak.days) * HP_PER_STREAK_DAY);
  return { bonus, hpBonus, note: noteFor(step, hpBonus), plain: step === 0 && hpBonus === 0 };
}

/** The stats a fight is actually fought with. Never below what you walked in on. */
export function statsWith(stats: Stats, vigour: Vigour): Stats {
  return addStats(stats, vigour.bonus);
}

/** A fight with nothing at your back — the case everything else is tuned against. */
export const NO_VIGOUR: Vigour = {
  bonus: { strength: 0, insight: 0, heart: 0, luck: 0 },
  hpBonus: 0,
  note: noteFor(0, 0),
  plain: true,
};
