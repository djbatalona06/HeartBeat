import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { chestPityFor, getOrCreateAvatar, openChestFor } from './index';
import { CHESTS, chestById, poolOf } from '../../domain/rpg/chests';
import { gearById } from '../../domain/rpg/gear';
import { REFINE_MAX } from '../../domain/rpg/shop';
import { tierRank } from '../../domain/rpg/tiers';

const HER = 'member-a';
const COUPLE = 'couple-1';

/** Rolls that land where the test wants, rather than where chance does. */
const rolls = (over: Partial<{ tier: number; kind: number; stat: number; pick: number }> = {}) => ({
  tier: 0.5, kind: 0.5, stat: 0.5, pick: 0.5, ...over,
});

beforeEach(async () => {
  await Promise.all([db.avatars.clear(), db.inventory.clear(), db.pets.clear()]);
});

async function withCoins(coins: number) {
  const avatar = await getOrCreateAvatar(HER, COUPLE);
  await db.avatars.put({ ...avatar, coins });
}

describe('paying for a chest', () => {
  it('refuses, and says how short, rather than going into debt', async () => {
    await withCoins(10);
    const result = await openChestFor(HER, COUPLE, 'wooden', rolls());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('more coins');
    expect((await db.avatars.get(HER))!.coins).toBe(10);
  });

  it('refuses a chest nobody stocks, without touching the wallet', async () => {
    await withCoins(9999);
    const result = await openChestFor(HER, COUPLE, 'platinum', rolls());
    expect(result.ok).toBe(false);
    expect((await db.avatars.get(HER))!.coins).toBe(9999);
  });

  it('takes exactly the price', async () => {
    await withCoins(1000);
    const chest = chestById('wooden')!;
    const result = await openChestFor(HER, COUPLE, 'wooden', rolls());
    expect(result.ok).toBe(true);
    // A first draw can never be a duplicate, so nothing is refunded here.
    expect((await db.avatars.get(HER))!.coins).toBe(1000 - chest.price);
  });

  /** The one outcome this function must never have. */
  it('always hands something over when it takes the coins', async () => {
    await withCoins(100_000);
    for (const chest of CHESTS) {
      for (let i = 0; i < 12; i += 1) {
        const result = await openChestFor(HER, COUPLE, chest.id, rolls({
          tier: i / 12, kind: (i * 7 % 12) / 12, pick: (i * 5 % 12) / 12,
        }));
        expect(result.ok, `${chest.id} draw ${i}`).toBe(true);
        if (result.ok) {
          expect(result.itemId).toBeTruthy();
          expect(result.name).toBeTruthy();
          expect(poolOf(chest)).toContain(result.tier);
        }
      }
    }
  });
});

describe('what lands', () => {
  it('writes an owned row for a first gear drop', async () => {
    await withCoins(5000);
    // Gear is first in PRIZE_KINDS, so a kind roll of zero always reaches it.
    const result = await openChestFor(HER, COUPLE, 'wooden', rolls({ kind: 0 }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.kind).toBe('gear');
    if (result.ok && result.kind === 'gear') {
      expect(result.duplicate).toBe(false);
      const row = await db.inventory.where('[memberId+itemId]')
        .equals([HER, result.itemId]).first();
      expect(row).toBeDefined();
      expect(row!.refine).toBe(0);
      expect(gearById(result.itemId)!.rarity).toBe(result.tier);
    }
  });

  it('hatches a companion rather than filing it in the bag', async () => {
    await withCoins(9000);
    // At epic the gilded chest offers gear, companions and things to plant, in
    // that order and in roughly 44/44/12 — so the middle of the kind roll is
    // the companion.
    const result = await openChestFor(HER, COUPLE, 'gilded', rolls({ kind: 0.6, tier: 0.9 }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.kind).toBe('companion');
    if (result.ok && result.kind === 'companion') {
      const pets = await db.pets.where('memberId').equals(HER).toArray();
      expect(pets.map((p) => p.kindId)).toContain(result.itemId);
    }
  });

  it('prefers something not already owned before repeating itself', async () => {
    await withCoins(200_000);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const result = await openChestFor(HER, COUPLE, 'wooden', rolls({ kind: 0, pick: i / 6 }));
      if (result.ok && result.kind === 'gear' && !result.duplicate) seen.add(result.itemId);
    }
    // Five gear slots, five commons. The first few draws should spread rather
    // than refining the same helmet over and over.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('duplicates', () => {
  it('refines gear already owned instead of stacking a second copy', async () => {
    await withCoins(500_000);
    let refinedOnce = false;
    for (let i = 0; i < 40 && !refinedOnce; i += 1) {
      const result = await openChestFor(HER, COUPLE, 'wooden', rolls({ kind: 0, pick: 0.1 }));
      if (result.ok && result.refined !== undefined) {
        refinedOnce = true;
        const row = await db.inventory.where('[memberId+itemId]')
          .equals([HER, result.itemId]).first();
        expect(row!.refine).toBe(result.refined);
        expect(row!.refine).toBeLessThanOrEqual(REFINE_MAX);
      }
    }
    expect(refinedOnce).toBe(true);
    const rows = await db.inventory.where('memberId').equals(HER).toArray();
    expect(new Set(rows.map((r) => r.itemId)).size).toBe(rows.length);
  });

  it('deepens a companion\'s bond instead of hatching a twin', async () => {
    await withCoins(500_000);
    let bondedOnce = false;
    for (let i = 0; i < 60 && !bondedOnce; i += 1) {
      const result = await openChestFor(HER, COUPLE, 'gilded', rolls({ kind: 0.6, tier: 0.9 }));
      if (result.ok && result.bonded !== undefined) {
        bondedOnce = true;
        const pet = (await db.pets.where('memberId').equals(HER).toArray())
          .find((p) => p.kindId === result.itemId)!;
        expect(pet.bond).toBeGreaterThan(0);
      }
    }
    expect(bondedOnce).toBe(true);
    const pets = await db.pets.where('memberId').equals(HER).toArray();
    expect(new Set(pets.map((p) => p.kindId)).size).toBe(pets.length);
  });

  /** Seven hundred coins must never buy a shrug. */
  it('never leaves a paid draw with nothing to show for it', async () => {
    await withCoins(500_000);
    for (let i = 0; i < 60; i += 1) {
      const before = (await db.avatars.get(HER))!.coins;
      const result = await openChestFor(HER, COUPLE, 'silver', rolls({
        kind: (i % 4) / 4, tier: (i % 5) / 5, pick: (i % 3) / 3,
      }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const after = (await db.avatars.get(HER))!.coins;
      const gotSomething = !result.duplicate
        || result.refined !== undefined
        || result.bonded !== undefined
        || (result.refunded ?? 0) > 0;
      expect(gotSomething, `draw ${i} of ${result.kind}`).toBe(true);
      if (result.refunded) expect(after).toBe(before - chestPrice('silver') + result.refunded);
    }
  });
});

function chestPrice(id: string) {
  return chestById(id)!.price;
}

describe('the counter', () => {
  it('starts at nothing and is kept per chest', async () => {
    await withCoins(100_000);
    expect(await chestPityFor(HER, 'wooden')).toBe(0);

    // A draw that lands under the floor should move only this chest's counter.
    await openChestFor(HER, COUPLE, 'wooden', rolls({ tier: 0.999 }));
    expect(await chestPityFor(HER, 'wooden')).toBe(1);
    expect(await chestPityFor(HER, 'silver')).toBe(0);
    expect(await chestPityFor(HER, 'gilded')).toBe(0);
  });

  it('clears when the draw pays out', async () => {
    await withCoins(100_000);
    await openChestFor(HER, COUPLE, 'wooden', rolls({ tier: 0.999 }));
    expect(await chestPityFor(HER, 'wooden')).toBe(1);
    await openChestFor(HER, COUPLE, 'wooden', rolls({ tier: 0 }));
    expect(await chestPityFor(HER, 'wooden')).toBe(0);
  });

  /** The promise the counter exists to keep, driven through real storage. */
  it('honours the floor once the window is reached', async () => {
    await withCoins(500_000);
    const chest = chestById('wooden')!;
    for (let i = 0; i < chest.pityAt; i += 1) {
      await openChestFor(HER, COUPLE, 'wooden', rolls({ tier: 0.999 }));
    }
    expect(await chestPityFor(HER, 'wooden')).toBe(chest.pityAt);

    const floored = await openChestFor(HER, COUPLE, 'wooden', rolls({ tier: 0.999 }));
    expect(floored.ok).toBe(true);
    if (floored.ok) {
      expect(tierRank(floored.tier)).toBeGreaterThanOrEqual(tierRank(chest.pityTier));
      expect(floored.draw.flooredBy).toBe(chest.pityTier);
    }
    expect(await chestPityFor(HER, 'wooden')).toBe(0);
  });

  it('is the same draw from the same rolls and the same counter', async () => {
    await withCoins(100_000);
    const a = await openChestFor(HER, COUPLE, 'silver', rolls());
    await db.avatars.clear();
    await db.inventory.clear();
    await db.pets.clear();
    await withCoins(100_000);
    const b = await openChestFor(HER, COUPLE, 'silver', rolls());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.itemId).toBe(b.itemId);
      expect(a.tier).toBe(b.tier);
    }
  });
});
