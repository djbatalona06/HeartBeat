import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { grantLifeEvent, settleLifeEvents } from './index';
import { GOOD_VIBES_SENDER_GRANT, grantFor } from '../../domain/rpg/lifeEvents';
import type { LifeEvent } from '../../domain/rpg/types';

/**
 * The one thing that must not go wrong: a Good Vibe paying twice, or not at all.
 *
 * The row is written on the sender's phone and the energy is owed on the
 * recipient's. Settlement is the only thing that moves it, so it has to be
 * certain in both directions — every arrived grant paid, and each of them once,
 * across as many sync passes as the app cares to run.
 */

const COUPLE = 'couple-1';
const ME = 'member-a';
const THEM = 'member-b';
const DAY = '2026-09-25';
const AT = 1_700_000_000_000;

function vibe(over: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'e-vibe', coupleId: COUPLE, memberId: ME, kind: 'good-vibes',
    day: DAY, fromMemberId: THEM, grantedAt: AT, updatedAt: AT, ...over,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.lifeEvents.clear(), db.lifeEventSettlements.clear(), db.avatars.clear(),
  ]);
});

describe('settleLifeEvents', () => {
  it('pays a grant the other phone wrote', async () => {
    await db.lifeEvents.put(vibe());
    expect((await settleLifeEvents(ME, COUPLE)).settled).toBe(1);

    const avatar = await db.avatars.get(ME);
    expect(avatar?.energy).toBe(grantFor('good-vibes').energy);
    expect(avatar?.coins).toBeGreaterThan(0);
  });

  /** The invariant. A second sync pass must move nothing. */
  it('pays it exactly once, however many times it runs', async () => {
    await db.lifeEvents.put(vibe());
    await settleLifeEvents(ME, COUPLE);
    const after = await db.avatars.get(ME);

    expect((await settleLifeEvents(ME, COUPLE)).settled).toBe(0);
    expect((await settleLifeEvents(ME, COUPLE)).settled).toBe(0);

    expect((await db.avatars.get(ME))?.energy).toBe(after?.energy);
    expect((await db.avatars.get(ME))?.xp).toBe(after?.xp);
  });

  /**
   * A self-granted hard day was already paid by `grantLifeEvent` on this very
   * phone. Settling it as well would double every restorative grant in the app.
   */
  it('leaves an event this phone granted itself alone', async () => {
    await grantLifeEvent(COUPLE, ME, 'hard-day', DAY);
    const paid = await db.avatars.get(ME);

    expect((await settleLifeEvents(ME, COUPLE)).settled).toBe(0);
    expect((await db.avatars.get(ME))?.energy).toBe(paid?.energy);
  });

  it('ignores a grant addressed to the other person', async () => {
    await db.lifeEvents.put(vibe({ id: 'e-theirs', memberId: THEM, fromMemberId: ME }));
    expect((await settleLifeEvents(ME, COUPLE)).settled).toBe(0);
    expect(await db.avatars.get(ME)).toBeUndefined();
  });

  it('pays several arrivals in one pass', async () => {
    await db.lifeEvents.bulkPut([
      vibe({ id: 'v1' }), vibe({ id: 'v2' }), vibe({ id: 'v3' }),
    ]);
    expect((await settleLifeEvents(ME, COUPLE)).settled).toBe(3);
    expect((await db.avatars.get(ME))?.energy).toBe(grantFor('good-vibes').energy * 3);
  });
});

describe('grantLifeEvent, on the sending phone', () => {
  /**
   * The bug this whole mechanism exists for: the sender used to write the
   * recipient's payout into a local copy of their partner's avatar, which is a
   * row `collectPending` never pushes and `shouldApply` never accepts. The
   * energy went nowhere.
   */
  it('pays the sender and does not touch the recipient', async () => {
    const result = await grantLifeEvent(COUPLE, THEM, 'good-vibes', DAY, { fromMemberId: ME });
    expect(result.ok).toBe(true);

    expect((await db.avatars.get(ME))?.energy).toBe(GOOD_VIBES_SENDER_GRANT.energy);
    expect(await db.avatars.get(THEM)).toBeUndefined();
  });

  it('stamps the row so it can be pushed at all', async () => {
    await grantLifeEvent(COUPLE, ME, 'hard-day', DAY);
    const [row] = await db.lifeEvents.toArray();
    expect(row.updatedAt).toBeGreaterThan(0);
    expect(row.updatedAt).toBe(row.grantedAt);
  });
});
