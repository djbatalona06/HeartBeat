import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, saveSettings } from '../../db/database';
import { saveProfile } from './profile';

/**
 * `saveProfile` is what both the "who you are" block on Settings and the
 * naming gate call — write the name locally, then push it to the server so
 * the other phone's copy of this couple's members agrees. Live against a
 * fake `/api/profile`, the way `receivePairingCode.test.ts` is live against a
 * fake pair/join: the point is what actually lands in Dexie, not just that
 * the right functions were called.
 */

const MEMBER = 'member-mine';
const COUPLE = 'couple-1';

beforeEach(async () => {
  await db.settings.clear();
  await db.members.clear();
  await saveSettings({ memberId: MEMBER, coupleId: COUPLE });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveProfile', () => {
  it('writes the name locally even with no token, so it renders offline', async () => {
    await saveProfile({ displayName: 'Robin' }, undefined);
    const mine = await db.members.get(MEMBER);
    expect(mine?.displayName).toBe('Robin');
  });

  it('pushes to the server when a token is held, and applies what comes back', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/profile');
      expect(init?.method).toBe('PUT');
      const body = JSON.parse(String(init?.body)) as { displayName?: string };
      expect(body.displayName).toBe('Robin');
      return Response.json({
        members: [
          { id: MEMBER, coupleId: COUPLE, displayName: 'Robin', updatedAt: Date.now() },
        ],
      });
    });
    vi.stubGlobal('fetch', fetch);

    await saveProfile({ displayName: 'Robin' }, 'token-a');

    expect(fetch).toHaveBeenCalledTimes(1);
    const mine = await db.members.get(MEMBER);
    expect(mine?.displayName).toBe('Robin');
  });

  it('does not touch the network at all with no token', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await saveProfile({ displayName: 'Robin' }, undefined);
    expect(fetch).not.toHaveBeenCalled();
  });
});
