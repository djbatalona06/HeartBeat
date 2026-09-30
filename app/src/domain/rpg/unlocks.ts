import { TOGETHER_TIERS } from './together';

/**
 * Long goals, visible from the first day.
 *
 * `together.ts` already had a ladder that took most of a year to climb, and
 * nothing on screen said it existed — a goal nobody can see is a surprise, not
 * a goal. This names what the long climb is *for*, and how far along it is.
 *
 * ## The rules this module keeps
 *
 * - **Progress comes first.** Every unlock says how far along it is (0-1)
 *   whether or not it is reached; eligibility is only the case `progress === 1`.
 * - **Lifetime totals only.** Together points and the pet's level never go down
 *   (`together.ts`: "a tier you cannot fall out of"), so no unlock can be lost,
 *   expire, or count down. Nothing here takes a date.
 * - **Derived, never stored.** The caller assembles `UnlockState` from what is
 *   already stored and asks again next time; a saved "unlocked" flag would be a
 *   second copy that could disagree with the numbers it came from.
 */

export interface UnlockState {
  /** Lifetime together points (`loyaltyPoints`). */
  togetherPoints: number;
  /** The shared pet's level, from `domain/xp.ts`. */
  petLevel: number;
  /** The shared pet has reached Elder (`vitals.ts`). */
  elder: boolean;
}

export interface UnlockCheck {
  eligible: boolean;
  /** 0-1, monotonic in every input. */
  progress: number;
  /** The number the goal is counted in, as it stands, and what it needs. */
  have: number;
  need: number;
}

export type UnlockKind = 'cosmetic' | 'mechanic' | 'status';

export interface Unlock {
  id: 'shared-aura' | 'ascendant' | 'evergreen-frame';
  name: string;
  /** What it is, in one line, for the card. */
  blurb: string;
  /** What `have` / `need` count, for the number under the bar. */
  unit: string;
  kind: UnlockKind;
  check(state: UnlockState): UnlockCheck;
}

const tierAt = (name: string): number => {
  const tier = TOGETHER_TIERS.find((t) => t.name === name);
  if (!tier) throw new Error(`no together tier named ${name}`);
  return tier.at;
};

/** Rooted and Evergreen, read off the ladder so the two cannot drift apart. */
export const AURA_POINTS = tierAt('Rooted');
export const FRAME_POINTS = tierAt('Evergreen');
/** The pet level Ascendant asks for, on top of Elder. */
export const ASCENDANT_LEVEL = 21;
/**
 * How far Ascendant's bar can go on level alone. The last stretch is Elder, so
 * a pet at level 21 that is not yet an Elder reads 90%, not a full bar that
 * refuses to open.
 */
const LEVEL_SHARE = 0.9;

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

function byPoints(need: number) {
  return ({ togetherPoints }: UnlockState): UnlockCheck => {
    const have = Math.max(0, Math.floor(togetherPoints));
    const progress = clamp01(have / need);
    return { eligible: progress >= 1, progress, have, need };
  };
}

export const UNLOCKS: readonly Unlock[] = [
  {
    id: 'shared-aura',
    name: 'Shared Aura',
    blurb: 'A glow around your pet, for a season of the two of you.',
    unit: 'together points',
    kind: 'cosmetic',
    check: byPoints(AURA_POINTS),
  },
  {
    id: 'ascendant',
    name: 'Ascendant',
    blurb: 'Your pet grows past Elder and fights harder beside you.',
    unit: 'pet levels',
    kind: 'mechanic',
    check: ({ petLevel, elder }) => {
      const have = Math.max(0, Math.floor(petLevel));
      const levels = clamp01(have / ASCENDANT_LEVEL);
      const progress = elder ? levels : Math.min(levels, 1) * LEVEL_SHARE;
      return { eligible: progress >= 1, progress, have, need: ASCENDANT_LEVEL };
    },
  },
  {
    id: 'evergreen-frame',
    name: 'Evergreen Frame',
    blurb: 'A frame around your home, for most of a year together.',
    unit: 'together points',
    kind: 'status',
    check: byPoints(FRAME_POINTS),
  },
];

export interface GoalView {
  unlock: Unlock;
  check: UnlockCheck;
}

/** Every unlock, checked. */
export function goals(state: UnlockState): GoalView[] {
  return UNLOCKS.map((unlock) => ({ unlock, check: unlock.check(state) }));
}

/** The nearest goals still ahead, furthest along first. */
export function nextGoals(state: UnlockState, n = 2): GoalView[] {
  return goals(state)
    .filter((goal) => !goal.check.eligible)
    .sort((a, b) => b.check.progress - a.check.progress)
    .slice(0, n);
}

/** Whether one unlock is reached, for the places that show the reward. */
export function isUnlocked(id: Unlock['id'], state: UnlockState): boolean {
  return UNLOCKS.find((u) => u.id === id)?.check(state).eligible ?? false;
}
