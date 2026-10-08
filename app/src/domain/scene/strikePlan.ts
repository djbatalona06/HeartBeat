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
  /**
   * The couple's move: both of you gathering, springing at it together, and
   * settling back. The longest single beat in a fight, and the only one that is
   * a small scene of its own rather than a lunge — see `togetherBeats`.
   */
  together: 1500,
} as const;

export type FightTiming = { readonly [K in keyof typeof FIGHT_TIMING]: number };

const STILL: FightTiming = { strike: 0, hurt: 0, skill: 0, defeat: 0, turnGap: 0, together: 0 };

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

/**
 * How the couple's move divides its time.
 *
 * Fractions, so the whole scene scales with `FIGHT_TIMING.together` and calm
 * (which is zero) keeps every beat at zero without a condition of its own:
 * both of you gather and link up, spring at the foe together, the hit lands,
 * and you settle back. They sum to one, and `strikePlan.test.ts` holds that.
 */
export const TOGETHER_BEATS = { gather: 0.3, charge: 0.3, impact: 0.27, settle: 0.13 } as const;

export type TogetherBeats = { readonly [K in keyof typeof TOGETHER_BEATS]: number };

/** Each beat of the couple's move, in milliseconds. */
export function togetherBeats(plan: FightTiming): TogetherBeats {
  return {
    gather: plan.together * TOGETHER_BEATS.gather,
    charge: plan.together * TOGETHER_BEATS.charge,
    impact: plan.together * TOGETHER_BEATS.impact,
    settle: plan.together * TOGETHER_BEATS.settle,
  };
}

/**
 * A round in which the couple's move is played: the move itself, the gap, and
 * the monster's swing. No skill flourish — Together is nobody's to decorate —
 * so this is the longest a round can run, and it has to stay under the same
 * ceiling `roundLength` does.
 */
export function togetherRoundLength(plan: FightTiming): number {
  return plan.together + plan.turnGap + plan.strike + plan.hurt;
}
