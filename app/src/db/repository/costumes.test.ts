import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { buyCostume, getOrCreateAvatar, wearCostume, wearDye } from './index';
import { COSTUMES } from '../../domain/rpg/costumes';

const ME = 'member-me';
const COUPLE = 'couple-1';
const HAT = COSTUMES.find((c) => c.price === 60)!;

beforeEach(async () => {
  await db.avatars.clear();
  await db.inventory.clear();
});

async function rich() {
  await getOrCreateAvatar(ME, COUPLE);
  await db.avatars.update(ME, { coins: 1000 });
}

describe('buying a costume', () => {
  it('takes the coins and adds one row, once', async () => {
    await rich();
    expect((await buyCostume(ME, COUPLE, HAT.id)).ok).toBe(true);
    expect((await db.avatars.get(ME))!.coins).toBe(1000 - HAT.price);
    expect((await buyCostume(ME, COUPLE, HAT.id)).ok).toBe(false);
    expect(await db.inventory.count()).toBe(1);
  });

  it('refuses what you cannot afford, and what does not exist', async () => {
    await getOrCreateAvatar(ME, COUPLE);
    await db.avatars.update(ME, { coins: 1 });
    expect((await buyCostume(ME, COUPLE, HAT.id)).ok).toBe(false);
    expect((await buyCostume(ME, COUPLE, 'costume-nope')).ok).toBe(false);
    expect(await db.inventory.count()).toBe(0);
  });
});

describe('wearing a costume', () => {
  it('needs it to be yours first', async () => {
    await rich();
    expect((await wearCostume(ME, COUPLE, HAT.id)).ok).toBe(false);
    await buyCostume(ME, COUPLE, HAT.id);
    expect((await wearCostume(ME, COUPLE, HAT.id)).ok).toBe(true);
    expect((await db.avatars.get(ME))!.costume).toBe(HAT.id);
  });

  it('can be taken off again', async () => {
    await rich();
    await buyCostume(ME, COUPLE, HAT.id);
    await wearCostume(ME, COUPLE, HAT.id);
    expect((await wearCostume(ME, COUPLE, null)).ok).toBe(true);
    expect((await db.avatars.get(ME))!.costume).toBeUndefined();
  });

  it('is independent of the dye: wearing one never writes the other', async () => {
    await rich();
    await buyCostume(ME, COUPLE, HAT.id);
    await wearDye(ME, COUPLE, 'dye-house-sparrow');
    await wearCostume(ME, COUPLE, HAT.id);
    const avatar = (await db.avatars.get(ME))!;
    expect(avatar.dye).toBe('dye-house-sparrow');
    expect(avatar.costume).toBe(HAT.id);
    await wearCostume(ME, COUPLE, null);
    expect((await db.avatars.get(ME))!.dye).toBe('dye-house-sparrow');
  });
});
