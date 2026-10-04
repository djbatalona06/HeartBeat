import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { getOrCreateAvatar, setAvatarMascot } from './index';

const ME = 'member-me';

beforeEach(async () => {
  await db.avatars.clear();
});

describe('recording the mascot on the avatar', () => {
  it('writes the mascot once and stamps the row so it syncs', async () => {
    const before = await getOrCreateAvatar(ME, 'couple-1');
    await new Promise((r) => setTimeout(r, 5));
    expect(await setAvatarMascot(ME, 'pony')).toBe(true);
    const after = (await db.avatars.get(ME))!;
    expect(after.mascot).toBe('pony');
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
  });

  it('writes nothing when it is already current, so nothing re-syncs', async () => {
    await getOrCreateAvatar(ME, 'couple-1');
    await setAvatarMascot(ME, 'pony');
    const stamped = (await db.avatars.get(ME))!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    expect(await setAvatarMascot(ME, 'pony')).toBe(false);
    expect((await db.avatars.get(ME))!.updatedAt).toBe(stamped);
  });

  it('follows a change of theme', async () => {
    await getOrCreateAvatar(ME, 'couple-1');
    await setAvatarMascot(ME, 'pony');
    expect(await setAvatarMascot(ME, 'sponge')).toBe(true);
    expect((await db.avatars.get(ME))!.mascot).toBe('sponge');
  });

  it('never mints an avatar, which would hand out the starter wallet before onboarding reveals it', async () => {
    expect(await setAvatarMascot(ME, 'pony')).toBe(false);
    expect(await db.avatars.count()).toBe(0);
  });
});
