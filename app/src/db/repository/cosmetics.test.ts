import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { buyDye, buyFurniture, getOrCreateAvatar, refurnishHouse, wearDye } from './index';
import { DEFAULT_DYE_ID, DYES } from '../../domain/rpg/dyes';
import { FURNITURE, HOUSE_SLOTS, furnitureForSlot } from '../../domain/rpg/furniture';

/**
 * Buying the things that change nothing about what you can do.
 *
 * There was no test file for this module at all, which mattered more once the
 * room started furnishing itself: `buyFurniture` now writes to `pet` as well
 * as `avatars` and `inventory`, in one transaction, and the room's
 * upgrade-only rule is the thing standing between two phones and a loop of
 * each deleting the other's furniture.
 */

const HER = 'member-a';
const HIM = 'member-b';
const COUPLE = 'couple-1';

const floor = furnitureForSlot('floor');
const dearerFloor = floor[0].price > floor[1].price ? floor[0] : floor[1];
const cheaperFloor = floor[0].price > floor[1].price ? floor[1] : floor[0];
const wall = furnitureForSlot('wall')[0];

beforeEach(async () => {
  await Promise.all([db.avatars.clear(), db.inventory.clear(), db.pet.clear()]);
});

async function withCoins(memberId: string, coins: number) {
  const avatar = await getOrCreateAvatar(memberId, COUPLE);
  await db.avatars.put({ ...avatar, coins });
}

const houseOf = async () => (await db.pet.get(COUPLE))?.house ?? {};

describe('buying furniture', () => {
  it('refuses a piece nobody stocks, without touching the wallet', async () => {
    await withCoins(HER, 9999);
    const result = await buyFurniture(HER, COUPLE, 'decor-nope');
    expect(result.ok).toBe(false);
    expect((await db.avatars.get(HER))!.coins).toBe(9999);
  });

  it('refuses when short, and says so', async () => {
    await withCoins(HER, 1);
    const result = await buyFurniture(HER, COUPLE, wall.id);
    expect(result.ok).toBe(false);
    expect((await db.avatars.get(HER))!.coins).toBe(1);
    expect(await houseOf()).toEqual({});
  });

  it('takes the price and files the row', async () => {
    await withCoins(HER, 5000);
    expect((await buyFurniture(HER, COUPLE, wall.id)).ok).toBe(true);
    expect((await db.avatars.get(HER))!.coins).toBe(5000 - wall.price);
    const row = await db.inventory.where('[memberId+itemId]').equals([HER, wall.id]).first();
    expect(row).toBeDefined();
  });

  it('refuses a second copy, since there is no second level of owning a rug', async () => {
    await withCoins(HER, 5000);
    await buyFurniture(HER, COUPLE, wall.id);
    const again = await buyFurniture(HER, COUPLE, wall.id);
    expect(again.ok).toBe(false);
    const rows = await db.inventory.where('[memberId+itemId]').equals([HER, wall.id]).toArray();
    expect(rows).toHaveLength(1);
  });

  /**
   * Buying is placing. A purchase that took the coins must never leave the
   * room unchanged — the same guarantee `openChestFor` makes about a chest.
   */
  it('puts the piece in the room in the same breath', async () => {
    await withCoins(HER, 5000);
    await buyFurniture(HER, COUPLE, wall.id);
    expect((await houseOf()).wall).toBe(wall.id);
  });

  it('creates the pet row lazily, so a couple can furnish before logging anything', async () => {
    await withCoins(HER, 5000);
    expect(await db.pet.get(COUPLE)).toBeUndefined();
    await buyFurniture(HER, COUPLE, wall.id);
    expect(await db.pet.get(COUPLE)).toBeDefined();
  });

  it('keeps the better piece when the cheaper one is bought second', async () => {
    await withCoins(HER, 50_000);
    await buyFurniture(HER, COUPLE, dearerFloor.id);
    await buyFurniture(HER, COUPLE, cheaperFloor.id);
    // Owning both, the room shows the dearer — buying something worse than
    // what is in the slot must not downgrade the room.
    expect((await houseOf()).floor).toBe(dearerFloor.id);
  });

  it('upgrades the slot when the better piece is bought second', async () => {
    await withCoins(HER, 50_000);
    await buyFurniture(HER, COUPLE, cheaperFloor.id);
    expect((await houseOf()).floor).toBe(cheaperFloor.id);
    await buyFurniture(HER, COUPLE, dearerFloor.id);
    expect((await houseOf()).floor).toBe(dearerFloor.id);
  });

  it('furnishes the whole room once everything is owned', async () => {
    await withCoins(HER, 500_000);
    for (const piece of FURNITURE) await buyFurniture(HER, COUPLE, piece.id);
    const house = await houseOf();
    expect(Object.keys(house).sort()).toEqual([...HOUSE_SLOTS].sort());
  });
});

/**
 * The property that makes a couple-level room safe to derive from per-member
 * inventories, driven through real storage rather than only through the pure
 * function.
 */
describe('a room two people furnish', () => {
  it('does not lose what the other one bought', async () => {
    await withCoins(HER, 50_000);
    await withCoins(HIM, 50_000);
    await buyFurniture(HER, COUPLE, dearerFloor.id);
    await buyFurniture(HIM, COUPLE, wall.id);

    const house = await houseOf();
    expect(house.floor).toBe(dearerFloor.id);
    expect(house.wall).toBe(wall.id);
  });

  it('is the same room whichever of them refurnishes last', async () => {
    await withCoins(HER, 50_000);
    await withCoins(HIM, 50_000);
    await buyFurniture(HER, COUPLE, dearerFloor.id);
    await buyFurniture(HIM, COUPLE, cheaperFloor.id);

    const before = await houseOf();
    await refurnishHouse(HIM, COUPLE);
    await refurnishHouse(HER, COUPLE);
    await refurnishHouse(HIM, COUPLE);
    expect(await houseOf()).toEqual(before);
    // And the better piece is the one standing there, not the last one bought.
    expect((await houseOf()).floor).toBe(dearerFloor.id);
  });

  it('is what a phone that has just pulled the other one\'s purchase can call', async () => {
    await withCoins(HIM, 50_000);
    await buyFurniture(HIM, COUPLE, wall.id);
    // Her device, with none of his inventory, must not empty the room.
    const result = await refurnishHouse(HER, COUPLE);
    expect(result.ok).toBe(true);
    expect((await houseOf()).wall).toBe(wall.id);
  });
});

describe('buying and wearing a colourway', () => {
  const paid = DYES.find((dye) => dye.price > 0)!;

  it('refuses one nobody stocks', async () => {
    await withCoins(HER, 9999);
    expect((await buyDye(HER, COUPLE, 'dye-nope')).ok).toBe(false);
  });

  it('takes the price, and refuses a second copy', async () => {
    await withCoins(HER, 5000);
    expect((await buyDye(HER, COUPLE, paid.id)).ok).toBe(true);
    expect((await db.avatars.get(HER))!.coins).toBe(5000 - paid.price);
    expect((await buyDye(HER, COUPLE, paid.id)).ok).toBe(false);
  });

  it('will not dress the bird in something that was never bought', async () => {
    await withCoins(HER, 5000);
    const result = await wearDye(HER, COUPLE, paid.id);
    expect(result.ok).toBe(false);
    expect((await db.avatars.get(HER))!.dye).not.toBe(paid.id);
  });

  it('wears one that was', async () => {
    await withCoins(HER, 5000);
    await buyDye(HER, COUPLE, paid.id);
    expect((await wearDye(HER, COUPLE, paid.id)).ok).toBe(true);
    expect((await db.avatars.get(HER))!.dye).toBe(paid.id);
  });

  /** What the bird hatched in, rather than something acquired. */
  it('always lets the starter dye back on, unowned', async () => {
    await withCoins(HER, 5000);
    await buyDye(HER, COUPLE, paid.id);
    await wearDye(HER, COUPLE, paid.id);
    expect((await wearDye(HER, COUPLE, DEFAULT_DYE_ID)).ok).toBe(true);
    expect((await db.avatars.get(HER))!.dye).toBe(DEFAULT_DYE_ID);
  });
});
