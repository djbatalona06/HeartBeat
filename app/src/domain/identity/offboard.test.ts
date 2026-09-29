import { describe, expect, it } from 'vitest';
import { PERSONAL_TABLES, partnerKeys } from './offboard';
import { REKEY_TABLES } from './rekey';

const plan = (table: string) => {
  const found = REKEY_TABLES.find((p) => p.table === table);
  if (!found) throw new Error(table);
  return found;
};

describe('partnerKeys', () => {
  it('names the partner’s rows and nobody else’s', () => {
    const rows = [
      { id: 'm1', memberId: 'me', day: '2026-09-01' },
      { id: 'm2', memberId: 'them', day: '2026-09-01' },
    ];
    expect(partnerKeys(plan('moods'), rows, 'them')).toEqual(['m2']);
  });

  it('drops their members row, keyed by the member id itself', () => {
    const rows = [{ id: 'me', coupleId: 'c' }, { id: 'them', coupleId: 'c' }];
    expect(partnerKeys(plan('members'), rows, 'them')).toEqual(['them']);
  });

  it('keeps a Good Vibe they sent to you: only the owner field counts', () => {
    const rows = [
      { id: 'a', memberId: 'me', fromMemberId: 'them' },
      { id: 'b', memberId: 'them', fromMemberId: 'me' },
    ];
    expect(partnerKeys(plan('lifeEvents'), rows, 'them')).toEqual(['b']);
  });

  it('leaves couple-level tables alone', () => {
    const rows = [{ coupleId: 'c' }];
    expect(partnerKeys(plan('pet'), rows, 'them')).toEqual([]);
    expect(partnerKeys(plan('quests'), [{ id: 'q', coupleId: 'c' }], 'them')).toEqual([]);
  });

  it('is exactly the tables that carry a member field', () => {
    const couple = ['pet', 'worldProgress', 'quests', 'wagers', 'achievements'];
    expect(PERSONAL_TABLES.map((p) => p.table)).not.toEqual(expect.arrayContaining(couple));
    expect(PERSONAL_TABLES.every((p) => p.memberFields.length > 0)).toBe(true);
  });
});
