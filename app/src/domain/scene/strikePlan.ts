/**
 * How long each beat of a fight round takes, and the rule that calm takes none.
 *
 * Same contract as `levelUpPlan` (`features/pet/levelUpAnimator.ts`) and the
 * chest animator: **calm means zero.** Not shorter, not a fade instead of a
 * slide. Zero, so a calm fight round shows the hit in the log and the bars
 * the moment C# has priced it, and nothing waits on an animation to finish.
 *
 * `calm` is `useTheme().calm`, which already includes `prefers-reduced-motion`.
 * Nothing here reads a media query.
 *
 * The numbers used to be constants at the top of `BattleGardenScene.ts` and
 * `EveGardenPage.tsx`. They live here so the calm rule is one line with a test
 * on it, rather than a condition every tween has to remember.
 */

/** The one copy of these numbers, in milliseconds. */
export const FIGHT_TIMING = {
  /** The attacker lunging forward and back. */
  strike: 400,
  /** The victim knocked back and returning. */
  hurt: 300,
  /** A companion's skill holding the screen before the swing behind it. */
  skill: 520,
  /** The monster fading out. */
  defeat: 800,
  /** The pause between your swing and theirs, so the two read as two. */
  turnGap: 220,
} as const;

export type FightTiming = { readonly [K in keyof typeof FIGHT_TIMING]: number };

const STILL: FightTiming = { strike: 0, hurt: 0, skill: 0, defeat: 0, turnGap: 0 };

export function strikePlan({ calm }: { calm: boolean }): FightTiming {
  return calm ? STILL : FIGHT_TIMING;
}

/**
 * The longest a single round can hold the screen: a skill, your swing, the
 * gap, their swing. The move bar is locked for all of it.
 */
export function roundLength(plan: FightTiming): number {
  return plan.skill + 2 * (plan.strike + plan.hurt) + plan.turnGap;
}
