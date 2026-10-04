import { describe, expect, it } from 'vitest';
import {
  guardView, nextPrompt, promptApplies, togetherRewardLines,
  type PromptAction, type PromptStep,
} from './gatePrompt';
import { STAGES_PER_ISLAND } from './world';

const ACTIONS: PromptAction[] = ['join', 'decline', 'back', 'solo', 'dismiss'];

describe('declining party mode', () => {
  it('cannot be done in one action, from the first step', () => {
    for (const action of ACTIONS) {
      const result = nextPrompt('ask', action);
      expect(result.done === 'solo', action).toBe(false);
    }
  });

  it('is two deliberate actions: decline, then solo', () => {
    const first = nextPrompt('ask', 'decline');
    expect(first).toEqual({ step: 'confirm' });
    expect(nextPrompt('confirm', 'solo')).toEqual({ done: 'solo' });
  });

  it('is the only way to finish as solo', () => {
    for (const step of ['ask', 'confirm'] as PromptStep[]) {
      for (const action of ACTIONS) {
        const result = nextPrompt(step, action);
        if (result.done === 'solo') expect([step, action]).toEqual(['confirm', 'solo']);
      }
    }
  });

  it('steps back on Escape or the scrim at the second step, and never declines', () => {
    expect(nextPrompt('confirm', 'dismiss')).toEqual({ step: 'ask' });
    expect(nextPrompt('confirm', 'back')).toEqual({ step: 'ask' });
  });

  it('leaves the gate, choosing nothing, when dismissed at the first step', () => {
    expect(nextPrompt('ask', 'dismiss')).toEqual({ done: 'leave' });
  });

  it('lets the first step accept party mode, and the second step not', () => {
    expect(nextPrompt('ask', 'join')).toEqual({ done: 'party' });
    expect(nextPrompt('confirm', 'join')).toEqual({ step: 'confirm' });
  });
});

describe('when the prompt is asked', () => {
  it('is only on the boss stage, and only with a partner', () => {
    expect(promptApplies(STAGES_PER_ISLAND, true)).toBe(true);
    expect(promptApplies(STAGES_PER_ISLAND, false)).toBe(false);
    for (let stage = 1; stage < STAGES_PER_ISLAND; stage += 1) {
      expect(promptApplies(stage, true), `stage ${stage}`).toBe(false);
    }
  });

  it('names the three things going in together adds', () => {
    expect(togetherRewardLines()).toEqual(['+50% pet XP', '2× coins', 'A coin purse']);
  });
});

describe('what the guard shows', () => {
  const BOSS = STAGES_PER_ISLAND;
  const ready = { loading: false, hasPartner: true, stage: 1, mode: null, opened: null } as const;

  it('waits while settings, members or the world are loading', () => {
    expect(guardView({ ...ready, loading: true })).toEqual({ view: 'loading' });
  });

  it('opens the garden at once on stages 1-6, and with no partner', () => {
    expect(guardView(ready)).toEqual({ view: 'garden', party: true });
    expect(guardView({ ...ready, hasPartner: false, stage: BOSS })).toEqual({ view: 'garden', party: true });
  });

  it('asks on the boss stage until answered, then keeps the answer', () => {
    expect(guardView({ ...ready, stage: BOSS })).toEqual({ view: 'prompt' });
    expect(guardView({ ...ready, stage: BOSS, mode: 'solo' })).toEqual({ view: 'garden', party: false });
  });

  // The bug this replaced: the guard re-read the stage live, so beating stage 6
  // inside the garden flipped it to the prompt and unmounted the fight, victory
  // banner and all. Once the garden has been shown, nothing takes it away.
  it('never swaps an open garden for the prompt', () => {
    for (const stage of [1, BOSS - 1, BOSS]) {
      for (const hasPartner of [true, false]) {
        expect(guardView({ ...ready, stage, hasPartner, opened: true })).toEqual({ view: 'garden', party: true });
        expect(guardView({ ...ready, stage, hasPartner, opened: false })).toEqual({ view: 'garden', party: false });
      }
    }
  });

  it('keeps an open garden through a reload of settings or the world', () => {
    expect(guardView({ ...ready, loading: true, opened: true })).toEqual({ view: 'garden', party: true });
  });
});
