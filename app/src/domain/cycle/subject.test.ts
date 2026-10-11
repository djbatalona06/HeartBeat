import { describe, expect, it } from 'vitest';
import {
  canChooseViewing, cycleSubject, partnerIdOf, partnerLogsCycle, partnerTracksCycle, type CycleFacts,
} from './subject';

const ME = 'member-me';
const THEM = 'member-them';

const facts = (over: Partial<CycleFacts> = {}): CycleFacts => ({
  myId: ME, tracksCycle: true, partnerId: THEM, rowOwners: [], ...over,
});

describe('whose cycle the page draws', () => {
  it('is mine when I log, whether or not I have written anything yet', () => {
    expect(cycleSubject(facts())).toBe(ME);
    expect(cycleSubject(facts({ rowOwners: [ME] }))).toBe(ME);
  });

  it('is my partner\'s when I do not log and they have rows', () => {
    expect(cycleSubject(facts({ tracksCycle: false, rowOwners: [THEM] }))).toBe(THEM);
  });

  it('is nobody when I do not log and they have written nothing', () => {
    expect(cycleSubject(facts({ tracksCycle: false }))).toBeNull();
  });

  it('is nobody until identity and the answer have both loaded', () => {
    // The flash this prevents: with no id, every row is "somebody else's".
    expect(cycleSubject(facts({ myId: null, tracksCycle: false, rowOwners: [ME, THEM] }))).toBeNull();
    expect(cycleSubject(facts({ tracksCycle: undefined, rowOwners: [ME, THEM] }))).toBeNull();
  });

  it('never picks up rows left behind by someone who is not this couple\'s partner', () => {
    // A row from an old couple is not the partner's, whoever wrote it.
    expect(cycleSubject(facts({ tracksCycle: false, rowOwners: ['member-from-before'] }))).toBeNull();
    expect(cycleSubject(facts({ tracksCycle: false, partnerId: null, rowOwners: ['member-from-before'] }))).toBeNull();
  });
});

describe('when both of you log', () => {
  const both = facts({ rowOwners: [ME, THEM] });

  it('offers the choice and honours it', () => {
    expect(canChooseViewing(both)).toBe(true);
    expect(cycleSubject(both, 'me')).toBe(ME);
    expect(cycleSubject(both, 'partner')).toBe(THEM);
  });

  it('offers no choice when only one of you has rows, and ignores a stale request', () => {
    expect(canChooseViewing(facts({ rowOwners: [ME] }))).toBe(false);
    expect(cycleSubject(facts({ rowOwners: [ME] }), 'partner')).toBe(ME);
    expect(canChooseViewing(facts({ tracksCycle: false, rowOwners: [THEM] }))).toBe(false);
    expect(cycleSubject(facts({ tracksCycle: false, rowOwners: [THEM] }), 'me')).toBe(THEM);
  });
});

describe('whether the other person logs a cycle', () => {
  it('is true once they have written a row, which is what actually syncs', () => {
    expect(partnerLogsCycle(facts({ rowOwners: [THEM] }))).toBe(true);
    expect(partnerTracksCycle(facts({ rowOwners: [THEM] }))).toBe(true);
  });

  it('is true when I said the page is my partner\'s, before they have logged', () => {
    expect(partnerTracksCycle(facts({ tracksCycle: false }))).toBe(true);
  });

  it('is false when I log and they have not, and on a lone phone', () => {
    expect(partnerTracksCycle(facts())).toBe(false);
    expect(partnerTracksCycle(facts({ tracksCycle: false, partnerId: null }))).toBe(false);
    expect(partnerTracksCycle(facts({ partnerId: null, rowOwners: [THEM] }))).toBe(false);
  });

  it('is false while the question is unanswered and they have no rows', () => {
    expect(partnerTracksCycle(facts({ tracksCycle: undefined }))).toBe(false);
  });
});

describe('finding the partner', () => {
  const rows = [
    { id: ME, coupleId: 'c1' },
    { id: THEM, coupleId: 'c1' },
    { id: 'old-partner', coupleId: 'c0' },
    { id: 'left', coupleId: 'c1', revokedAt: 5 },
  ];

  it('is the other member of this couple', () => {
    expect(partnerIdOf(rows, ME, 'c1')).toBe(THEM);
  });

  it('is nobody on a lone phone, before identity loads, or when they have left', () => {
    expect(partnerIdOf([{ id: ME, coupleId: 'c1' }], ME, 'c1')).toBeNull();
    expect(partnerIdOf(rows, null, 'c1')).toBeNull();
    expect(partnerIdOf(rows, ME, undefined)).toBeNull();
    expect(partnerIdOf([{ id: 'left', coupleId: 'c1', revokedAt: 5 }], ME, 'c1')).toBeNull();
  });

  it('ignores a member of an earlier couple', () => {
    expect(partnerIdOf(rows.filter((r) => r.id !== THEM), ME, 'c1')).toBeNull();
  });
});
