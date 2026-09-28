import { describe, expect, it } from 'vitest';
import type { Member } from '../../domain/types';
import {
  PARTNER_NAME_POLL_MS, PARTNER_POLL_MS, partnerLinkMessage, partnerOf, partnerPollMs, showNamingGate,
} from './namingGate';

const base = { paired: true, hasPartner: true, myName: undefined, seen: false };

describe('showNamingGate', () => {
  it('shows once a partner exists and this phone has no name yet', () => {
    expect(showNamingGate(base)).toBe(true);
  });

  it('stays hidden on the phone that only started a pairing — a token but no partner', () => {
    expect(showNamingGate({ ...base, paired: true, hasPartner: false })).toBe(false);
  });

  it('stays hidden while nobody has paired at all', () => {
    expect(showNamingGate({ ...base, paired: false, hasPartner: false })).toBe(false);
  });

  it('never shows once this phone already has a name, blank or not', () => {
    expect(showNamingGate({ ...base, myName: 'Dana' })).toBe(false);
    expect(showNamingGate({ ...base, myName: '   ' })).toBe(true); // whitespace is not a name
  });

  it('never shows again once dismissed, name or not', () => {
    expect(showNamingGate({ ...base, seen: true })).toBe(false);
  });
});

describe('partnerOf', () => {
  const row = (id: string, coupleId: string, displayName = ''): Member =>
    ({ id, coupleId, displayName, tracksCycle: false, updatedAt: 0 }) as Member;
  const me = { coupleId: 'c1', memberId: 'a' };

  it('finds the other person in this couple', () => {
    expect(partnerOf([row('a', 'c1'), row('b', 'c1', 'Bee')], me)?.displayName).toBe('Bee');
  });

  it('is nobody when only this phone’s own row exists — the starter, waiting', () => {
    expect(partnerOf([row('a', 'c1')], me)).toBeUndefined();
  });

  it('does not count a row left over from another couple as a partner', () => {
    expect(partnerOf([row('a', 'c1'), row('old', 'c0')], me)).toBeUndefined();
  });

  it('is nobody before this phone has paired at all', () => {
    expect(partnerOf([row('a', 'c1'), row('b', 'c1')], {})).toBeUndefined();
    expect(partnerOf(undefined, me)).toBeUndefined();
  });
});

describe('partnerPollMs', () => {
  const partner = (displayName: string): Member =>
    ({ id: 'b', coupleId: 'c1', displayName, tracksCycle: false, updatedAt: 0 }) as Member;

  it('does not ask before this phone has paired', () => {
    expect(partnerPollMs(false, undefined)).toBeNull();
  });

  it('asks briskly while a token has no partner — the phone that started, waiting', () => {
    expect(partnerPollMs(true, undefined)).toBe(PARTNER_POLL_MS);
  });

  it('keeps asking, gently, until the partner picks a name', () => {
    expect(partnerPollMs(true, partner(''))).toBe(PARTNER_NAME_POLL_MS);
    expect(partnerPollMs(true, partner('   '))).toBe(PARTNER_NAME_POLL_MS);
    expect(PARTNER_NAME_POLL_MS).toBeGreaterThan(PARTNER_POLL_MS);
  });

  it('stops for good once the partner has a name', () => {
    expect(partnerPollMs(true, partner('Bee'))).toBeNull();
  });
});

describe('partnerLinkMessage', () => {
  it('names the specific person, not a placeholder', () => {
    expect(partnerLinkMessage('Jordan')).toBe('You’re linked with Jordan.');
  });

  it('trims what it is handed', () => {
    expect(partnerLinkMessage('  Jordan  ')).toBe('You’re linked with Jordan.');
  });

  it('says so, rather than naming nobody, when the partner has not chosen a name', () => {
    expect(partnerLinkMessage(undefined)).toContain('haven’t picked a name yet');
    expect(partnerLinkMessage('')).toContain('haven’t picked a name yet');
    expect(partnerLinkMessage('   ')).toContain('haven’t picked a name yet');
  });
});
