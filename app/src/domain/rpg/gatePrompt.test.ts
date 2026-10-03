import { describe, expect, it } from 'vitest';
import {
  nextPrompt, promptApplies, togetherRewardLines,
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
