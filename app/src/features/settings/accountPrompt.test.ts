import { describe, expect, it } from 'vitest';
import {
  configuredProviders, showAccountPrompt, type AccountPromptState,
} from './accountPrompt';

const BASE: AccountPromptState = {
  paired: true,
  onboarded: true,
  otherGateShowing: false,
  seen: false,
  providers: {
    google: { configured: true, linked: false },
    github: { configured: true, linked: false },
  },
};

describe('showAccountPrompt', () => {
  it('shows once, to a paired phone, when a provider is configured', () => {
    expect(showAccountPrompt(BASE)).toBe(true);
  });

  it('waits until there is something to connect', () => {
    expect(showAccountPrompt({ ...BASE, paired: false })).toBe(false);
  });

  it('never lands on top of first-run onboarding or another one-time screen', () => {
    expect(showAccountPrompt({ ...BASE, onboarded: false })).toBe(false);
    expect(showAccountPrompt({ ...BASE, otherGateShowing: true })).toBe(false);
  });

  it('asks only once', () => {
    expect(showAccountPrompt({ ...BASE, seen: true })).toBe(false);
  });

  it('stays quiet on a deploy with no OAuth app, or before the answer is in', () => {
    expect(showAccountPrompt({ ...BASE, providers: {} })).toBe(false);
    expect(showAccountPrompt({
      ...BASE,
      providers: { google: null, github: { configured: false, linked: false } },
    })).toBe(false);
  });

  it('stays quiet once either account is already connected', () => {
    expect(showAccountPrompt({
      ...BASE,
      providers: {
        google: { configured: true, linked: true },
        github: { configured: true, linked: false },
      },
    })).toBe(false);
  });

  it('still shows with just one provider configured', () => {
    expect(showAccountPrompt({
      ...BASE,
      providers: { github: { configured: true, linked: false } },
    })).toBe(true);
  });
});

describe('configuredProviders', () => {
  it('offers Google first, because not everyone has a GitHub account', () => {
    expect(configuredProviders(BASE.providers)).toEqual(['google', 'github']);
  });

  it('skips what is not configured', () => {
    expect(configuredProviders({
      google: { configured: false, linked: false },
      github: { configured: true, linked: false },
    })).toEqual(['github']);
  });
});
