import {
  TOGETHER_COIN_MULTIPLIER, TOGETHER_PURSES, TOGETHER_XP_SHARE, partnerGateApplies,
} from './raidGate';

/**
 * The Boss Gate prompt: asking whether to go in as a pair, and making a "no"
 * cost two deliberate taps.
 *
 * Going in together ("party mode") is worth a better payout on the boss stage
 * and nothing is locked behind it -- `BOSS_REQUIRES_PARTNER` is false -- so the
 * question is an invitation. Declining it is allowed, but not by accident: a
 * stray tap on "Not now" lands on a second step that says what is being given
 * up, and only a separate, explicit "Go in solo" there completes it.
 *
 * Pure, so the rule is a table a test can walk rather than behaviour somebody
 * has to remember to preserve in a component.
 *
 *      ask --join-------> party            (done)
 *      ask --decline----> confirm
 *      ask --dismiss----> leave            (done: out of the gate, nothing chosen)
 *      confirm --back---> ask
 *      confirm --dismiss> ask              (Escape or the scrim steps back, never declines)
 *      confirm --solo---> solo             (done)
 *
 * Anything else leaves the step where it is.
 */

export type PromptStep = 'ask' | 'confirm';
export type PromptAction = 'join' | 'decline' | 'back' | 'solo' | 'dismiss';
export type PromptResult =
  | { step: PromptStep; done?: undefined }
  | { done: 'party' | 'solo' | 'leave' };

export function nextPrompt(step: PromptStep, action: PromptAction): PromptResult {
  if (step === 'ask') {
    if (action === 'join') return { done: 'party' };
    if (action === 'decline') return { step: 'confirm' };
    if (action === 'dismiss') return { done: 'leave' };
    return { step };
  }
  if (action === 'solo') return { done: 'solo' };
  if (action === 'back' || action === 'dismiss') return { step: 'ask' };
  return { step };
}

/**
 * Whether to ask at all: a boss stage, and somebody to ask about. Every earlier
 * stage is asynchronous and must never mention a partner (CLAUDE.md), so for
 * those the gate opens without a word.
 */
export function promptApplies(stage: number, hasPartner: boolean): boolean {
  return hasPartner && partnerGateApplies(stage);
}

/** What going in together adds, in words -- the same three the gate itself lists. */
export function togetherRewardLines(): string[] {
  return [
    `+${Math.round(TOGETHER_XP_SHARE * 100)}% pet XP`,
    `${TOGETHER_COIN_MULTIPLIER}× coins`,
    TOGETHER_PURSES === 1 ? 'A coin purse' : `${TOGETHER_PURSES} coin purses`,
  ];
}

export interface GuardInputs {
  /** Settings, members or the couple's world are still being read. */
  loading: boolean;
  hasPartner: boolean;
  stage: number;
  /** The prompt's answer this visit, if it has been given. */
  mode: 'party' | 'solo' | null;
  /** The `party` the garden was first shown with, or null before it was shown. */
  opened: boolean | null;
}

export type GuardView = { view: 'loading' } | { view: 'prompt' } | { view: 'garden'; party: boolean };

/**
 * What the Boss Gate guard renders.
 *
 * `opened` comes first, and that is the fix this exists for: the stage is read
 * live, so beating stage 6 inside the garden used to turn this into the prompt
 * and unmount the fight that had just been won. The question is asked on the
 * way in and never again for the same visit.
 */
export function guardView({ loading, hasPartner, stage, mode, opened }: GuardInputs): GuardView {
  if (opened !== null) return { view: 'garden', party: opened };
  if (loading) return { view: 'loading' };
  if (mode) return { view: 'garden', party: mode === 'party' };
  if (!promptApplies(stage, hasPartner)) return { view: 'garden', party: true };
  return { view: 'prompt' };
}
