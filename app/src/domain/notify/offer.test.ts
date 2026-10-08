import { describe, expect, it } from 'vitest';
import { OFFER_BACKOFF_MS, shouldOfferPush, shouldReofferInstall, type PushOfferInput } from './offer';

const NOW = 1_800_000_000_000;
const READY: PushOfferInput = {
  permission: 'default', canPrompt: true, paired: true, notifyOn: false, justWon: true, now: NOW,
};

describe('shouldOfferPush', () => {
  it('offers right after a win, when it can still ask', () => {
    expect(shouldOfferPush(READY)).toBe(true);
  });

  it('never offers without a win to ride on', () => {
    expect(shouldOfferPush({ ...READY, justWon: false })).toBe(false);
  });

  it('never re-asks a browser that already answered, either way', () => {
    expect(shouldOfferPush({ ...READY, permission: 'granted' })).toBe(false);
    expect(shouldOfferPush({ ...READY, permission: 'denied' })).toBe(false);
    expect(shouldOfferPush({ ...READY, permission: 'unsupported' })).toBe(false);
  });

  it('waits for the installed app on iOS, and for a partner', () => {
    expect(shouldOfferPush({ ...READY, canPrompt: false })).toBe(false);
    expect(shouldOfferPush({ ...READY, paired: false })).toBe(false);
    expect(shouldOfferPush({ ...READY, notifyOn: true })).toBe(false);
  });

  it('backs off after "not now", then asks again', () => {
    expect(shouldOfferPush({ ...READY, dismissedAt: NOW - 1000 })).toBe(false);
    expect(shouldOfferPush({ ...READY, dismissedAt: NOW - OFFER_BACKOFF_MS })).toBe(true);
  });
});

describe('shouldReofferInstall', () => {
  it('re-offers Safari visitors once the back-off has passed', () => {
    expect(shouldReofferInstall({ state: 'needs-install', ios: true, offeredAt: NOW - OFFER_BACKOFF_MS, now: NOW })).toBe(true);
    expect(shouldReofferInstall({ state: 'needs-install', ios: true, offeredAt: NOW - 1000, now: NOW })).toBe(false);
  });

  it('never nags the installed app, another browser, or a desktop', () => {
    expect(shouldReofferInstall({ state: 'installed', ios: true, now: NOW })).toBe(false);
    expect(shouldReofferInstall({ state: 'unsupported-browser', ios: true, now: NOW })).toBe(false);
    expect(shouldReofferInstall({ state: 'needs-install', ios: false, now: NOW })).toBe(false);
  });
});
