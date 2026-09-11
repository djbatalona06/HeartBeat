import { describe, expect, it } from 'vitest';
import {
  HOLDING_KINDS, PARTNER_VISIBLE_KINDS, PARTNER_WRITABLE_KINDS, highWaterAfter,
  isPartnerVisible, isPartnerWritable, keyOf, mineToPush, pendingSince,
  shouldApply, stampOf, toWire, writerOf,
  type HoldingKind, type PulledHolding,
} from './holdings';
import type { Avatar, Cheer, LifeEvent } from '../rpg/types';
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

function lifeEvent(over: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'le-1', coupleId: 'c1', memberId: ME, kind: 'hard-day',
    day: '2026-09-25', grantedAt: AT, updatedAt: AT, ...over,
  };
}

/** A Good Vibe: addressed to ME, written by THEM. The distinction is the point. */
function vibe(over: Partial<LifeEvent> = {}): LifeEvent {
  return lifeEvent({ id: 'le-v', kind: 'good-vibes', memberId: ME, fromMemberId: THEM, ...over });
}

function cheer(over: Partial<Cheer> = {}): Cheer {
  return {
    id: `le-1:${ME}`, coupleId: 'c1', memberId: ME, eventId: 'le-1',
    createdAt: AT, updatedAt: AT, ...over,
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
      lifeEvent, cheer,
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

describe('which kinds are writable, and which are merely visible', () => {
  /**
   * These were one list, and splitting them is what let life events sync at
   * all. Writable is a security property — it decides whether the other phone
   * may overwrite a row it did not write — and is mirrored in SQL. Visible is a
   * display decision. A test that let the two collapse back into each other
   * would let a display decision quietly hand out write permission.
   */
  it('lets either of you write only the quest', () => {
    expect(PARTNER_WRITABLE_KINDS).toEqual(['quest']);
    for (const kind of HOLDING_KINDS) {
      expect(isPartnerWritable(kind), kind).toBe(kind === 'quest');
    }
  });

  it('shows both of you the quest, life events and cheers', () => {
    expect(PARTNER_VISIBLE_KINDS).toEqual(['quest', 'lifeEvent', 'cheer']);
  });

  it('makes every writable kind visible, but not the reverse', () => {
    for (const kind of PARTNER_WRITABLE_KINDS) {
      expect(isPartnerVisible(kind), kind).toBe(true);
    }
    expect(isPartnerVisible('lifeEvent')).toBe(true);
    expect(isPartnerWritable('lifeEvent')).toBe(false);
  });
});

describe('writerOf', () => {
  /**
   * The trap the whole feature turns on: a Good Vibe's `memberId` is who
   * *receives* it. Reading that as the writer would have the recipient's phone
   * push their partner's grant back up under its own id every sync.
   */
  it('reads a Good Vibe as written by its sender, not its recipient', () => {
    expect(writerOf('lifeEvent', vibe())).toBe(THEM);
  });

  it('reads a self-granted event as written by the person it is about', () => {
    expect(writerOf('lifeEvent', lifeEvent({ memberId: THEM }))).toBe(THEM);
  });

  it('gives a quest no single writer, because it belongs to the couple', () => {
    expect(writerOf('quest', quest())).toBeUndefined();
  });

  it('reads a cheer as written by whoever left it', () => {
    expect(writerOf('cheer', cheer({ memberId: THEM }))).toBe(THEM);
  });
});

describe('mineToPush', () => {
  it('drops a Good Vibe our partner wrote, however it is addressed to us', () => {
    expect(mineToPush('lifeEvent', [vibe()], ME)).toEqual([]);
  });

  it('keeps an event this device actually wrote', () => {
    const mine = lifeEvent({ memberId: THEM, fromMemberId: ME });
    expect(mineToPush('lifeEvent', [mine], ME)).toEqual([mine]);
  });

  it('keeps the quest for either of us', () => {
    expect(mineToPush('quest', [quest()], ME)).toHaveLength(1);
    expect(mineToPush('quest', [quest()], THEM)).toHaveLength(1);
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

describe('applying a partner\'s row', () => {
  /** The case the whole feature turns on: their event has to land here. */
  it('applies a life event our partner wrote', () => {
    const row = pulled({
      id: 'le-v', kind: 'lifeEvent', payload: vibe(), memberId: THEM, mine: false,
    });
    expect(shouldApply(row, undefined)).toBe(true);
  });

  it('applies a cheer our partner left', () => {
    const row = pulled({
      id: `le-1:${THEM}`, kind: 'cheer', payload: cheer({ memberId: THEM }),
      memberId: THEM, mine: false,
    });
    expect(shouldApply(row, undefined)).toBe(true);
  });

  /**
   * Re-pinned after the gate changed from ownership to visibility, because the
   * change is exactly the sort that quietly widens what it was narrowing.
   */
  it('still refuses every personal kind our partner wrote', () => {
    for (const kind of ['inventory', 'pet', 'avatar', 'task'] as const) {
      const row = pulled({ kind, memberId: THEM, mine: false });
      expect(shouldApply(row, undefined), kind).toBe(false);
    }
  });
});

describe('life events written before they synced', () => {
  it('stamps as 0 and is never offered', () => {
    const legacy = { ...lifeEvent(), updatedAt: undefined } as unknown as LifeEvent;
    expect(stampOf(legacy)).toBe(0);
    // Deliberately not falling back to `grantedAt`. This stamp becomes the
    // server's `updated_at`, which is the partner's pull cursor — a row landing
    // below a cursor that has already passed it is stored and never served.
    expect(pendingSince('lifeEvent', [legacy], 0)).toEqual([]);
  });
});
