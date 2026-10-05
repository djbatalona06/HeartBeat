import { ISLANDS } from './islands';
import type { ChestId } from './chests';

/**
 * Star chests: a free chest for every semi-boss and boss the couple clears.
 *
 * Milestones, not purchases. Each island's `SemiBoss` (stage 4) opens as a
 * silver chest and its `Boss` (stage 7) as a gilded one -- the same odds, luck
 * and pity as the Shop's, with no price. Derived from `ISLANDS`, so an island
 * added there brings its two stars with it.
 *
 * **Ready comes from the couple's world row; opened is per member.** `cleared`
 * is a union of both phones' wins, so a boss your partner beat first still
 * gives you your own star -- the same spirit as `gardenBested` paying per
 * member. Nothing pending is stored: eligibility is derived every time, and
 * only the claim (`Avatar.starChests`) is written, like `unlocks.ts`.
 *
 * Never sold. A star chest that could be bought would just be a chest.
 */

export interface StarMilestone {
  monsterId: string;
  island: number;
  stage: number;
  /** Which chest's odds it opens with. */
  chestId: ChestId;
  monster: string;
}

export const STAR_MILESTONES: readonly StarMilestone[] = ISLANDS.flatMap((island) => island.stages
  .filter((stage) => stage.type === 'SemiBoss' || stage.type === 'Boss')
  .map((stage) => ({
    monsterId: stage.monsterId,
    island: island.number,
    stage: stage.number,
    chestId: stage.type === 'Boss' ? 'gilded' as const : 'silver' as const,
    monster: stage.monster,
  })));

export function starMilestone(monsterId: string): StarMilestone | undefined {
  return STAR_MILESTONES.find((m) => m.monsterId === monsterId);
}

export type StarState = 'locked' | 'ready' | 'opened';

export function starState(monsterId: string, cleared: readonly string[], opened: readonly string[] = []): StarState {
  if (opened.includes(monsterId)) return 'opened';
  return cleared.includes(monsterId) ? 'ready' : 'locked';
}

/** Stars earned by the couple (cleared milestones), out of all of them. */
export function starCount(cleared: readonly string[]): { earned: number; total: number } {
  return {
    earned: STAR_MILESTONES.filter((m) => cleared.includes(m.monsterId)).length,
    total: STAR_MILESTONES.length,
  };
}
