import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { putCheer } from './index';
import { cheerId } from '../../domain/rpg/feed';
import type { LifeEvent } from '../../domain/rpg/types';

/**
 * The one thing that must not go wrong: a cheer becoming two rows.
 *
 * The id is derived from the event and the person, so a second tap — on this
 * phone or the other one — lands on the row that is already there. Re-putting
 * it would be worse than useless: a fresh `updatedAt` re-pushes the row on the
 * next sync and re-fires every live query watching the table, for a write
 * nobody can see.
 */

const COUPLE = 'couple-1';
const ME = 'member-a';
const THEM = 'member-b';
const AT = 1_700_000_000_000;

function event(over: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'e1', coupleId: COUPLE, memberId: ME, kind: 'good-vibes',
    day: '2026-09-25', fromMemberId: THEM, grantedAt: AT, updatedAt: AT, ...over,
  };
}

beforeEach(async () => {
  await Promise.all([db.cheers.clear(), db.lifeEvents.clear()]);
});

describe('putCheer', () => {
  it('writes one row, under the derived id', async () => {
    const result = await putCheer(COUPLE, ME, event());
    expect(result.ok).toBe(true);
    const rows = await db.cheers.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(cheerId('e1', ME));
    expect(rows[0].eventId).toBe('e1');
  });

  /** The invariant this file exists for. */
  it('writes nothing on a second tap, and does not move the stamp', async () => {
    await putCheer(COUPLE, ME, event());
    const first = await db.cheers.get(cheerId('e1', ME));

    const again = await putCheer(COUPLE, ME, event());
    expect(again.ok).toBe(true);

    expect(await db.cheers.count()).toBe(1);
    expect((await db.cheers.get(cheerId('e1', ME)))?.updatedAt).toBe(first?.updatedAt);
  });

  it('lets both of you cheer the same event without colliding', async () => {
    const selfLogged = event({ id: 'e2', kind: 'hard-day', memberId: 'someone', fromMemberId: undefined });
    await putCheer(COUPLE, ME, selfLogged);
    await putCheer(COUPLE, THEM, selfLogged);
    expect(await db.cheers.where('eventId').equals('e2').count()).toBe(2);
  });

  it('refuses your own event, with a reason to show', async () => {
    // Written by THEM, so THEM cannot cheer it.
    const result = await putCheer(COUPLE, THEM, event());
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(await db.cheers.count()).toBe(0);
  });

  it('carries the couple and the member, so the re-key can find it', async () => {
    await putCheer(COUPLE, ME, event());
    const row = await db.cheers.get(cheerId('e1', ME));
    expect(row?.coupleId).toBe(COUPLE);
    expect(row?.memberId).toBe(ME);
  });
});
