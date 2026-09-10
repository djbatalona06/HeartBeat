import { describe, expect, it } from 'vitest';
import {
  HOLDING_KINDS, SHARED_KINDS, highWaterAfter, isShared, keyOf, pendingSince,
  shouldApply, stampOf, toWire,
  type HoldingKind, type PulledHolding,
} from './holdings';
import type { Avatar } from '../rpg/types';
import type { InventoryItem } from '../rpg/inventory';
import type { Quest } from '../types';

const AT = 1_700_000_000_000;
const ME = 'me';
const THEM = 'them';

function item(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'inv-1', coupleId: 'c1', memberId: ME, itemId: 'head-ribbon',
    refine: 0, acquiredAt: AT, updatedAt: AT, ...over,
  };
}

function avatar(over: Partial<Avatar> = {}): Avatar {
  return {
    memberId: ME, coupleId: 'c1', xp: 0, coins: 120, energy: 0, mp: 0,
    gear: {}, updatedAt: AT, ...over,
  };
}

function quest(over: Partial<Quest> = {}): Quest {
  return {
    id: 'q1', coupleId: 'c1', templateId: 'move', difficulty: 'steady',
    title: 'Move on four days', target: 4, progress: 0, xp: 130,
    expiresAt: AT + 604_800_000, updatedAt: AT, ...over,
  };
}

function pulled(over: Partial<PulledHolding> = {}): PulledHolding {
  return {
    id: 'inv-1', kind: 'inventory', payload: item(), updatedAt: AT,
    memberId: ME, mine: true, ...over,
  };
}

describe('the wire shape', () => {
  /**
   * The keys are not uniform, and that is the whole reason `keyOf` exists. An
   * `Avatar` is keyed by `memberId` and has no `id` at all; reading `row.id`
   * everywhere would push it under `undefined`, and the puller would never
   * match it to anything local. That presents as "my gear came back and my
   * coins did not", which is a long way from the line that caused it.
   */
  it('keys an avatar by its member and everything else by its id', () => {
    expect(keyOf('avatar', avatar())).toBe(ME);
    expect(keyOf('inventory', item())).toBe('inv-1');
    expect(keyOf('quest', quest())).toBe('q1');
  });

  it('never keys a row as undefined, for any kind', () => {
    const rows: Record<HoldingKind, () => unknown> = {
      avatar: avatar, inventory: item, quest,
      pet: () => ({ id: 'p1', updatedAt: AT }),
      task: () => ({ id: 't1', updatedAt: AT }),
    };
    for (const kind of HOLDING_KINDS) {
      const key = keyOf(kind, rows[kind]() as never);
      expect(typeof key, kind).toBe('string');
      expect(key.length, kind).toBeGreaterThan(0);
    }
  });

  it('carries the row itself as the payload', () => {
    const row = item({ refine: 3 });
    expect(toWire('inventory', row)).toEqual({
      id: 'inv-1', kind: 'inventory', payload: row, updatedAt: AT,
    });
  });
});

describe('stampOf', () => {
  it('reads a stamped row', () => {
    expect(stampOf(item({ updatedAt: 42 }))).toBe(42);
  });

  /** Quests only gained `updatedAt` when they started syncing. */
  it('reads a quest written before the stamp existed as 0, not undefined', () => {
    const legacy = { ...quest(), updatedAt: undefined };
    expect(stampOf(legacy)).toBe(0);
    // The consequence, stated: it is never newer than a watermark, so it stays
    // on the phone that has it rather than arriving with a bogus time.
    expect(pendingSince('quest', [legacy], 0)).toEqual([]);
  });
});

describe('which kinds are shared', () => {
  it('shares the quest and nothing else', () => {
    expect(SHARED_KINDS).toEqual(['quest']);
    for (const kind of HOLDING_KINDS) {
      expect(isShared(kind), kind).toBe(kind === 'quest');
    }
  });
});

describe('shouldApply', () => {
  /**
   * The rule that matters most, and the one that is easy to leave out.
   *
   * The pull is a whole-couple feed *by design* — that is how a partner's rows
   * reach a device at all — so rows that are not ours arrive on every single
   * sync, legitimately. If "arrived" were treated as "applies to me", each
   * phone would overwrite its own inventory with the other's on every round
   * trip. The server refuses to store such a write; the client must also
   * refuse to apply one.
   */
  it('never lets a partner\'s personal row overwrite ours, even when newer', () => {
    const theirs = pulled({ mine: false, memberId: THEM, updatedAt: AT + 10_000 });
    expect(shouldApply(theirs, item())).toBe(false);
  });

  it('refuses a partner\'s personal row even when we have nothing there', () => {
    expect(shouldApply(pulled({ mine: false, memberId: THEM }), undefined)).toBe(false);
  });

  it('applies a shared quest from either of us', () => {
    const q = { ...pulled({ kind: 'quest', id: 'q1', mine: false, memberId: THEM }), updatedAt: AT + 1 };
    expect(shouldApply(q, quest())).toBe(true);
  });

  it('takes our own row when it is newer', () => {
    expect(shouldApply(pulled({ updatedAt: AT + 1 }), item())).toBe(true);
  });

  it('leaves a local row that is newer alone', () => {
    expect(shouldApply(pulled({ updatedAt: AT - 1 }), item())).toBe(false);
  });

  /** Otherwise every sync rewrites every row and re-fires every live query. */
  it('treats an unchanged row as a no-op rather than a write', () => {
    expect(shouldApply(pulled({ updatedAt: AT }), item({ updatedAt: AT }))).toBe(false);
  });

  it('takes anything for a key we do not have yet', () => {
    expect(shouldApply(pulled(), undefined)).toBe(true);
  });
});

describe('pendingSince', () => {
  it('sends what changed after the watermark and nothing at the watermark', () => {
    const rows = [item({ id: 'a', updatedAt: AT - 1 }), item({ id: 'b', updatedAt: AT }),
                  item({ id: 'c', updatedAt: AT + 1 })];
    expect(pendingSince('inventory', rows, AT).map((w) => w.id)).toEqual(['c']);
  });

  it('sends everything on a first sync', () => {
    expect(pendingSince('inventory', [item()], 0)).toHaveLength(1);
  });
});

describe('highWaterAfter', () => {
  it('steps past what was pushed and what arrived alike', () => {
    // Rows that arrived are already on the server; leaving the mark behind
    // them would send them straight back on the next round.
    const mark = highWaterAfter(
      AT,
      [toWire('inventory', item({ updatedAt: AT + 5 }))],
      [pulled({ updatedAt: AT + 9 })],
    );
    expect(mark).toBe(AT + 9);
  });

  it('never goes backwards', () => {
    expect(highWaterAfter(AT, [], [])).toBe(AT);
    expect(highWaterAfter(AT, [toWire('inventory', item({ updatedAt: 5 }))], [])).toBe(AT);
  });
});
