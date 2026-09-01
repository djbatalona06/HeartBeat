import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import {
  REKEY_TABLES,
  isUsableIdentity,
  needsWholeTable,
  planRekey,
  rehomes,
  rekeyRow,
  sameIdentity,
  slotOf,
  type TableRekey,
} from './rekey';

/**
 * The re-key runs exactly once in a couple's life, on the day they pair, and if
 * it is wrong nobody finds out: the rows it should have moved stay invisible,
 * which is the bug it exists to fix. So the cases that only happen once are
 * pinned here — a primary key that is itself an id, a day that already has an
 * answer, a partner's row that must not be touched, and a second run that has
 * to be a no-op.
 *
 * Dexie appears only to check the table list against the real schema; the
 * module under test never imports it.
 */

const PROVISIONAL = { memberId: 'prov-member', coupleId: 'prov-couple' };
const REAL = { memberId: 'real-member', coupleId: 'real-couple' };
const PARTNER = 'partner-member';
const DAY = '2026-08-31';

/** Tables that carry a couple id but are deliberately left out of the re-key. */
const NOT_RE_KEYED = ['quests', 'achievements', 'settings'];

function planFor(table: string): TableRekey {
  const plan = REKEY_TABLES.find((entry) => entry.table === table);
  if (!plan) throw new Error(`no re-key plan for ${table}`);
  return plan;
}

describe('REKEY_TABLES', () => {
  it('names only tables the database actually has', () => {
    const known = db.tables.map((table) => table.name);
    for (const plan of REKEY_TABLES) expect(known).toContain(plan.table);
  });

  it('covers every table whose rows are keyed to a member or a couple', () => {
    const planned = REKEY_TABLES.map((plan) => plan.table);
    for (const table of db.tables) {
      const keyPaths = [
        table.schema.primKey.keyPath,
        ...table.schema.indexes.map((index) => index.keyPath),
      ]
        .flat()
        .filter((path): path is string => typeof path === 'string');
      const identified = keyPaths.some((path) => path === 'memberId' || path === 'coupleId');
      if (!identified || NOT_RE_KEYED.includes(table.name)) continue;
      expect(planned).toContain(table.name);
    }
  });

  it('knows which tables cannot be updated in place', () => {
    expect(rehomes(planFor('pet'))).toBe(true);
    expect(rehomes(planFor('avatars'))).toBe(true);
    expect(rehomes(planFor('members'))).toBe(true);
    expect(rehomes(planFor('moods'))).toBe(false);
    expect(rehomes(planFor('messages'))).toBe(false);
  });
});

/**
 * The repository reads the whole table only when `needsWholeTable` says so, and
 * feeds `planRekey` nothing but the moving rows otherwise. That is only safe
 * while the plans with no slot are exactly the plans it filters: a plan that
 * `slotOf` gives a slot but this waves through would have `planRekey` deciding
 * collisions against an empty set, and quietly overwrite the row already there.
 * Nothing else pins the two together, so this does.
 */
describe('needsWholeTable', () => {
  it('reads whole exactly the plans whose rows occupy a slot', () => {
    for (const plan of REKEY_TABLES) {
      const row = { [plan.primaryKey]: 'k', memberId: 'm', coupleId: 'c', day: DAY };
      expect([plan.table, needsWholeTable(plan)])
        .toEqual([plan.table, slotOf(row, plan) !== undefined]);
    }
  });

  it('stops at the moving rows for a table that is neither re-homed nor daily', () => {
    expect(needsWholeTable(planFor('workoutPhotos'))).toBe(false);
    expect(needsWholeTable(planFor('work'))).toBe(false);
    expect(needsWholeTable(planFor('messages'))).toBe(false);
  });

  it('reads whole where a landing place can already be taken', () => {
    expect(needsWholeTable(planFor('moods'))).toBe(true);
    expect(needsWholeTable(planFor('members'))).toBe(true);
    expect(needsWholeTable(planFor('avatars'))).toBe(true);
  });
});

describe('sameIdentity', () => {
  it('needs both halves to match', () => {
    expect(sameIdentity(REAL, { ...REAL })).toBe(true);
    expect(sameIdentity(REAL, { ...REAL, memberId: 'other' })).toBe(false);
    expect(sameIdentity(REAL, { ...REAL, coupleId: 'other' })).toBe(false);
  });
});

describe('isUsableIdentity', () => {
  it('rejects a half-minted identity', () => {
    expect(isUsableIdentity(REAL)).toBe(true);
    expect(isUsableIdentity(undefined)).toBe(false);
    expect(isUsableIdentity({ memberId: 'm' })).toBe(false);
    expect(isUsableIdentity({ memberId: '', coupleId: 'c' })).toBe(false);
  });
});

describe('rekeyRow', () => {
  it('rewrites every field that named the identity being left', () => {
    const row = { id: 'e1', coupleId: PROVISIONAL.coupleId, memberId: PROVISIONAL.memberId };
    expect(rekeyRow(row, planFor('tasks'), PROVISIONAL, REAL)).toEqual({
      id: 'e1',
      coupleId: REAL.coupleId,
      memberId: REAL.memberId,
    });
  });

  it('leaves a field that names somebody else alone', () => {
    const row = { id: 'm1', memberId: PARTNER, day: DAY, joy: 7 };
    expect(rekeyRow(row, planFor('moods'), PROVISIONAL, REAL).memberId).toBe(PARTNER);
  });

  it('carries the sender of a good vibe as well as its receiver', () => {
    const row = {
      id: 'l1',
      coupleId: PROVISIONAL.coupleId,
      memberId: PARTNER,
      fromMemberId: PROVISIONAL.memberId,
      kind: 'good-vibes',
      day: DAY,
    };
    const next = rekeyRow(row, planFor('lifeEvents'), PROVISIONAL, REAL);
    expect(next.memberId).toBe(PARTNER);
    expect(next.fromMemberId).toBe(REAL.memberId);
  });

  it('does not mutate the row it is given', () => {
    const row = { memberId: PROVISIONAL.memberId, coupleId: PROVISIONAL.coupleId, xp: 40 };
    rekeyRow(row, planFor('avatars'), PROVISIONAL, REAL);
    expect(row.memberId).toBe(PROVISIONAL.memberId);
  });
});

describe('planRekey', () => {
  it('has nothing to do when the identity has not changed', () => {
    const rows = [{ id: 'm1', memberId: PROVISIONAL.memberId, day: DAY }];
    expect(planRekey(planFor('moods'), rows, PROVISIONAL, PROVISIONAL)).toEqual([]);
  });

  it('has nothing to do the second time, which is what makes it safe to re-run', () => {
    const rows = [{ id: 'm1', memberId: PROVISIONAL.memberId, day: DAY }];
    const first = planRekey(planFor('moods'), rows, PROVISIONAL, REAL);
    expect(first).toHaveLength(1);

    const after = first.flatMap((action) => (action.verb === 'drop' ? [] : [action.row]));
    expect(planRekey(planFor('moods'), after, PROVISIONAL, REAL)).toEqual([]);
  });

  it('writes a mood back under the same key, because the key is its own id', () => {
    const rows = [{ id: 'm1', memberId: PROVISIONAL.memberId, day: DAY, joy: 7 }];
    expect(planRekey(planFor('moods'), rows, PROVISIONAL, REAL)).toEqual([
      { verb: 'put', table: 'moods', row: { id: 'm1', memberId: REAL.memberId, day: DAY, joy: 7 } },
    ]);
  });

  it('moves the shared pet, whose primary key is the couple id', () => {
    const rows = [{ coupleId: PROVISIONAL.coupleId, level: 3, xp: 240 }];
    expect(planRekey(planFor('pet'), rows, PROVISIONAL, REAL)).toEqual([
      {
        verb: 'move',
        table: 'pet',
        oldKey: PROVISIONAL.coupleId,
        row: { coupleId: REAL.coupleId, level: 3, xp: 240 },
      },
    ]);
  });

  it('moves an avatar, whose primary key is the member id', () => {
    const rows = [{ memberId: PROVISIONAL.memberId, coupleId: PROVISIONAL.coupleId, xp: 120 }];
    expect(planRekey(planFor('avatars'), rows, PROVISIONAL, REAL)).toEqual([
      {
        verb: 'move',
        table: 'avatars',
        oldKey: PROVISIONAL.memberId,
        row: { memberId: REAL.memberId, coupleId: REAL.coupleId, xp: 120 },
      },
    ]);
  });

  it('drops a row that would land on a day the real member has already answered', () => {
    const rows = [
      { id: 'm1', memberId: PROVISIONAL.memberId, day: DAY, joy: 7 },
      { id: 'm2', memberId: REAL.memberId, day: DAY, joy: 2 },
    ];
    expect(planRekey(planFor('moods'), rows, PROVISIONAL, REAL)).toEqual([
      { verb: 'drop', table: 'moods', oldKey: 'm1' },
    ]);
  });

  it('still moves the days that are free when one of them is taken', () => {
    const rows = [
      { id: 'm1', memberId: PROVISIONAL.memberId, day: DAY, joy: 7 },
      { id: 'm2', memberId: PROVISIONAL.memberId, day: '2026-09-01', joy: 8 },
      { id: 'm3', memberId: REAL.memberId, day: DAY, joy: 2 },
    ];
    const actions = planRekey(planFor('moods'), rows, PROVISIONAL, REAL);
    expect(actions.map((action) => action.verb)).toEqual(['drop', 'put']);
  });

  it('drops an avatar rather than overwriting the one already under the real id', () => {
    const rows = [
      { memberId: PROVISIONAL.memberId, coupleId: PROVISIONAL.coupleId, xp: 120 },
      { memberId: REAL.memberId, coupleId: REAL.coupleId, xp: 0 },
    ];
    expect(planRekey(planFor('avatars'), rows, PROVISIONAL, REAL)).toEqual([
      { verb: 'drop', table: 'avatars', oldKey: PROVISIONAL.memberId },
    ]);
  });

  it('does not delete the key a row was just moved onto', () => {
    // Both rows carry the old couple id, so both move; the second one's own key
    // is where the first one lands. Conceding the slot must not take the winner
    // with it.
    const rows = [
      { memberId: PROVISIONAL.memberId, coupleId: PROVISIONAL.coupleId, xp: 120 },
      { memberId: REAL.memberId, coupleId: PROVISIONAL.coupleId, xp: 5 },
    ];
    expect(planRekey(planFor('avatars'), rows, PROVISIONAL, REAL)).toEqual([
      {
        verb: 'move',
        table: 'avatars',
        oldKey: PROVISIONAL.memberId,
        row: { memberId: REAL.memberId, coupleId: REAL.coupleId, xp: 120 },
      },
    ]);
  });

  it('lets only one of two rows wanting the same day through', () => {
    const rows = [
      { id: 'm1', memberId: PROVISIONAL.memberId, day: DAY, joy: 7 },
      { id: 'm2', memberId: PROVISIONAL.memberId, day: DAY, joy: 4 },
    ];
    const actions = planRekey(planFor('moods'), rows, PROVISIONAL, REAL);
    expect(actions.map((action) => action.verb)).toEqual(['put', 'drop']);
  });

  it('leaves the partner out of it', () => {
    const rows = [
      { id: 'w1', memberId: PARTNER, day: DAY, title: 'dentist' },
      { id: 'w2', memberId: PROVISIONAL.memberId, day: DAY, title: 'groceries' },
    ];
    const actions = planRekey(planFor('work'), rows, PROVISIONAL, REAL);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ verb: 'put', row: { id: 'w2', memberId: REAL.memberId } });
  });

  it('re-keys a task on either half of its identity', () => {
    const rows = [
      { id: 't1', memberId: PARTNER, coupleId: PROVISIONAL.coupleId, title: 'water plants' },
    ];
    expect(planRekey(planFor('tasks'), rows, PROVISIONAL, REAL)).toEqual([
      {
        verb: 'put',
        table: 'tasks',
        row: { id: 't1', memberId: PARTNER, coupleId: REAL.coupleId, title: 'water plants' },
      },
    ]);
  });

  it('moves a member row, whose id is the member id', () => {
    const rows = [
      {
        id: PROVISIONAL.memberId,
        coupleId: PROVISIONAL.coupleId,
        displayName: 'me',
        tracksCycle: false,
      },
    ];
    expect(planRekey(planFor('members'), rows, PROVISIONAL, REAL)).toEqual([
      {
        verb: 'move',
        table: 'members',
        oldKey: PROVISIONAL.memberId,
        row: {
          id: REAL.memberId,
          coupleId: REAL.coupleId,
          displayName: 'me',
          tracksCycle: false,
        },
      },
    ]);
  });
});
