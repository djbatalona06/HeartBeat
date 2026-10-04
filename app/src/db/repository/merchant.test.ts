import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { buyDeal, getOrCreateAvatar } from './index';
import { dealsFor } from '../../domain/rpg/merchant';

const ME = 'member-me';
const COUPLE = 'couple-1';
const DAY = '2026-10-05';

beforeEach(async () => {
  await db.avatars.clear();
  await db.inventory.clear();
  await db.pet.clear();
});

async function withCoins(coins: number) {
  await getOrCreateAvatar(ME, COUPLE);
  await db.avatars.update(ME, { coins });
}

describe('buying a merchant deal', () => {
  it('charges the deal price, not the list price, and grants the item', async () => {
    await withCoins(1000);
    for (const deal of dealsFor(DAY)) {
      const before = (await db.avatars.get(ME))!.coins;
      const result = await buyDeal(ME, COUPLE, DAY, deal.id);
      expect(result.ok, deal.id).toBe(true);
      expect((await db.avatars.get(ME))!.coins, deal.id).toBe(before - deal.price);
      expect(await db.inventory.where('[memberId+itemId]').equals([ME, deal.id]).count(), deal.id).toBe(1);
    }
  });

  it('refuses anything that is not on today\'s shelf', async () => {
    await withCoins(5000);
    const result = await buyDeal(ME, COUPLE, DAY, 'gear-not-stocked');
    expect(result).toMatchObject({ ok: false });
    expect(await db.inventory.count()).toBe(0);
    expect((await db.avatars.get(ME))!.coins).toBe(5000);
  });

  it('refuses an item stocked on another day, at that day\'s price', async () => {
    await withCoins(5000);
    const other = '2026-11-20';
    const only = dealsFor(other).find((d) => !dealsFor(DAY).some((x) => x.id === d.id))!;
    const result = await buyDeal(ME, COUPLE, DAY, only.id);
    expect(result.ok).toBe(false);
    expect(await db.inventory.count()).toBe(0);
  });

  it('will not sell a second copy or take coins twice', async () => {
    await withCoins(5000);
    const [deal] = dealsFor(DAY);
    await buyDeal(ME, COUPLE, DAY, deal.id);
    const coins = (await db.avatars.get(ME))!.coins;
    const again = await buyDeal(ME, COUPLE, DAY, deal.id);
    expect(again.ok).toBe(false);
    expect((await db.avatars.get(ME))!.coins).toBe(coins);
    expect(await db.inventory.count()).toBe(1);
  });

  it('says so, and spends nothing, when there are not enough coins', async () => {
    await withCoins(1);
    const [deal] = dealsFor(DAY);
    const result = await buyDeal(ME, COUPLE, DAY, deal.id);
    expect(result.ok).toBe(false);
    expect((await db.avatars.get(ME))!.coins).toBe(1);
    expect(await db.inventory.count()).toBe(0);
  });
});
