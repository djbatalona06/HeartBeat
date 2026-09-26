import { describe, expect, it } from 'vitest';
import { partnerLinkMessage, showNamingGate } from './namingGate';

const base = { paired: true, memberCount: 2, myName: undefined, seen: false };

describe('showNamingGate', () => {
  it('shows once a second member exists and this phone has no name yet', () => {
    expect(showNamingGate(base)).toBe(true);
  });

  it('stays hidden on the phone that only started a pairing — a token but no partner', () => {
    expect(showNamingGate({ ...base, paired: true, memberCount: 1 })).toBe(false);
  });

  it('stays hidden while nobody has paired at all', () => {
    expect(showNamingGate({ ...base, paired: false, memberCount: 1 })).toBe(false);
  });

  it('never shows once this phone already has a name, blank or not', () => {
    expect(showNamingGate({ ...base, myName: 'Dana' })).toBe(false);
    expect(showNamingGate({ ...base, myName: '   ' })).toBe(true); // whitespace is not a name
  });

  it('never shows again once dismissed, name or not', () => {
    expect(showNamingGate({ ...base, seen: true })).toBe(false);
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
