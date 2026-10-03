import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { buyEgg, getOrCreateAvatar, wearCostume, wearDye } from './index';
import { COSTUMES, COSTUME_REFUND, costumesOfTier } from '../../domain/rpg/costumes';
import { petKindById } from '../../domain/rpg/pets';
import { EGG_PRICE } from '../../domain/rpg/shop';

const ME = 'member-me';
const COUPLE = 'couple-1';
const HAT = COSTUMES[0];

beforeEach(async () => {
  await db.avatars.clear();
  await db.inventory.clear();
  await db.pets.clear();
});

async function rich() {
  await getOrCreateAvatar(ME, COUPLE);
  await db.avatars.update(ME, { coins: 1000 });
}

async function give(costumeId: string) {
  await db.inventory.put({
    id: `inv-${costumeId}`, coupleId: COUPLE, memberId: ME, itemId: costumeId,
    refine: 0, acquiredAt: 1, updatedAt: 1,
  });
}

// `rollRarity` walks from the rarest tier down, so a LOW roll is the rare one.
const COMMON = { rarity: 0.999999, species: 0, costume: 0 };
const MYTHIC = { rarity: 0, species: 0, costume: 0 };

describe('hatching an egg', () => {
  it('brings a costume at the same tier as the companion', async () => {
    await rich();
    const result = await buyEgg(COUPLE, ME, COMMON, 0);
    expect(result.ok).toBe(true);
    const tier = petKindById(result.pet!.kindId)!.rarity;
    expect(result.costume?.tier).toBe(tier);
    expect(costumesOfTier(tier).map((c) => c.id)).toContain(result.costume!.id);
    expect(result.costume!.duplicate).toBe(false);
    const rows = (await db.inventory.toArray()).map((r) => r.itemId);
    expect(rows).toContain(result.costume!.id);
  });

  it('matches a rarer companion with a rarer costume', async () => {
    await rich();
    const result = await buyEgg(COUPLE, ME, MYTHIC, 0);
    const tier = petKindById(result.pet!.kindId)!.rarity;
    expect(tier).toBe('mythic');
    expect(result.costume?.tier).toBe('mythic');
  });

  it('brings a common costume with a common companion', async () => {
    await rich();
    const result = await buyEgg(COUPLE, ME, COMMON, 0);
    expect(petKindById(result.pet!.kindId)!.rarity).toBe('common');
    expect(result.costume?.tier).toBe('common');
  });

  it('charges the egg and nothing else when the costume is new', async () => {
    await rich();
    await buyEgg(COUPLE, ME, COMMON, 0);
    expect((await db.avatars.get(ME))!.coins).toBe(1000 - EGG_PRICE);
  });

  it('refunds a few coins, and adds no row, when every costume at the tier is already yours', async () => {
    await rich();
    const probe = await buyEgg(COUPLE, ME, COMMON, 0);
    const tier = probe.costume!.tier;
    await db.inventory.clear();
    await db.pets.clear();
    await db.avatars.update(ME, { coins: 1000, pity: 0 });
    for (const costume of costumesOfTier(tier)) await give(costume.id);
    const before = await db.inventory.count();

    const result = await buyEgg(COUPLE, ME, COMMON, 0);
    expect(result.costume?.duplicate).toBe(true);
    expect(result.costume?.refunded).toBe(COSTUME_REFUND[tier]);
    expect(await db.inventory.count()).toBe(before);
    expect((await db.avatars.get(ME))!.coins).toBe(1000 - EGG_PRICE + COSTUME_REFUND[tier]);
  });

  it('never leaves an egg paying for itself through repeats', async () => {
    for (const tier of Object.keys(COSTUME_REFUND) as Array<keyof typeof COSTUME_REFUND>) {
      expect(COSTUME_REFUND[tier]).toBeLessThan(EGG_PRICE);
    }
  });

  it('is atomic: an egg you cannot afford brings nothing and takes nothing', async () => {
    await getOrCreateAvatar(ME, COUPLE);
    await db.avatars.update(ME, { coins: 5 });
    const result = await buyEgg(COUPLE, ME, COMMON, 0);
    expect(result.ok).toBe(false);
    expect(result.costume).toBeUndefined();
    expect(await db.inventory.count()).toBe(0);
    expect((await db.avatars.get(ME))!.coins).toBe(5);
  });
});

describe('wearing a costume', () => {
  it('needs it to be yours first', async () => {
    await rich();
    expect((await wearCostume(ME, COUPLE, HAT.id)).ok).toBe(false);
    await give(HAT.id);
    expect((await wearCostume(ME, COUPLE, HAT.id)).ok).toBe(true);
    expect((await db.avatars.get(ME))!.costume).toBe(HAT.id);
  });

  it('can be taken off again', async () => {
    await rich();
    await give(HAT.id);
    await wearCostume(ME, COUPLE, HAT.id);
    expect((await wearCostume(ME, COUPLE, null)).ok).toBe(true);
    expect((await db.avatars.get(ME))!.costume).toBeUndefined();
  });

  it('refuses a costume that does not exist', async () => {
    await rich();
    expect((await wearCostume(ME, COUPLE, 'costume-nope')).ok).toBe(false);
  });

  it('is independent of the dye: wearing one never writes the other', async () => {
    await rich();
    await give(HAT.id);
    await wearDye(ME, COUPLE, 'dye-house-sparrow');
    await wearCostume(ME, COUPLE, HAT.id);
    const avatar = (await db.avatars.get(ME))!;
    expect(avatar.dye).toBe('dye-house-sparrow');
    expect(avatar.costume).toBe(HAT.id);
    await wearCostume(ME, COUPLE, null);
    expect((await db.avatars.get(ME))!.dye).toBe('dye-house-sparrow');
  });
});
