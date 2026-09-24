import { milestonesAt } from '../rpg/milestones';

/**
 * When Home should mark the pet going up a level, and how loudly.
 *
 * Pure, so the two questions worth protecting — "is this a level-up at all?"
 * and "is it a big one?" — can be asked without a DOM or a database. The level
 * here is the pet's fifty-rung curve (`domain/xp.ts`), never the combat rank.
 */

/**
 * The level to celebrate, or `null`.
 *
 * `seen` is the last level this phone showed. `null` means it has never shown
 * one (a fresh install, cleared storage), and that is "unknown", not "zero":
 * celebrating from nothing would throw a party for level 12 on day one.
 */
export function levelUpSince(seen: number | null, now: number): number | null {
  return seen !== null && now > seen ? now : null;
}

/**
 * True when the jump from `seen` to `now` opened a garden plot.
 *
 * Checks every level in `(seen, now]`, so a jump that passes a plot level
 * without landing on it still counts. Reads the milestone table rather than
 * listing the levels, so moving a plot moves the bigger moment with it.
 */
export function isBigLevelUp(seen: number, now: number): boolean {
  for (let level = seen + 1; level <= now; level += 1) {
    if (milestonesAt(level).some((m) => m.kind === 'plot')) return true;
  }
  return false;
}
