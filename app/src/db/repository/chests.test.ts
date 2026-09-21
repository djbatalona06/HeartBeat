import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { chestPityFor, getOrCreateAvatar, openChestFor } from './index';
import { CHESTS, PRIZES_PER_CHEST, chestById, poolOf } from '../../domain/rpg/chests';
import type { ChestOutcome } from './chests';
import { gearById } from '../../domain/rpg/gear';
import { REFINE_MAX } from '../../domain/rpg/shop';
import { tierRank } from '../../domain/rpg/tiers';
import { FURNITURE } from '../../domain/rpg/furniture';
import { DYES } from '../../domain/rpg/dyes';

const HER = 'member-a';
const COUPLE = 'couple-1';

/**
 * Rolls that land where the test wants, rather than where chance does.
 *
 * One set per item, and by default all three identical — which is exactly the
 * case worth defaulting to, because three items rolled the same are three
 * shots at the same tier and kind, and that is what makes the within-a-chest
 * dedup below testable at all.
 */
const rolls = (
  over: Partial<{ tier: number; kind: number; stat: number; pick: number }> = {},
) => Array.from({ length: PRIZES_PER_CHEST }, () => ({
  tier: 0.5, kind: 0.5, stat: 0.5, pick: 0.5, ...over,
}));

/** The one prize in an opening that has exactly one. */
function only(outcome: ChestOutcome) {
  if (!outcome.ok) throw new Error(`not ok: ${outcome.reason}`);
  expect(outcome.prizes).toHaveLength(PRIZES_PER_CHEST);
  return outcome.prizes[0];
}

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

  it('refuses an opening with nothing to roll', async () => {
    await withCoins(9999);
    const result = await openChestFor(HER, COUPLE, 'wooden', []);
    expect(result.ok).toBe(false);
    expect((await db.avatars.get(HER))!.coins).toBe(9999);
  });

  it('takes exactly the price, however many items come out', async () => {
    await withCoins(1000);
    const chest = chestById('wooden')!;
    const result = await openChestFor(HER, COUPLE, 'wooden', rolls());
    expect(result.ok).toBe(true);
    // A first opening can never be a duplicate, so nothing is refunded here.
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
        expect(result.ok, `${chest.id} opening ${i}`).toBe(true);
        if (result.ok) {
          expect(result.prizes).toHaveLength(PRIZES_PER_CHEST);
          for (const prize of result.prizes) {
            expect(prize.itemId).toBeTruthy();
            expect(prize.name).toBeTruthy();
            expect(poolOf(chest)).toContain(prize.tier);
          }
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
    const prize = only(result);
    expect(prize.kind).toBe('gear');
    expect(prize.duplicate).toBe(false);
    const row = await db.inventory.where('[memberId+itemId]')
      .equals([HER, prize.itemId]).first();
    expect(row).toBeDefined();
    expect(row!.refine).toBe(0);
    expect(gearById(prize.itemId)!.rarity).toBe(prize.tier);
  });

  it('hatches a companion rather than filing it in the bag', async () => {
    await withCoins(9000);
    // At epic the gilded chest offers gear, companions and things to plant, in
    // that order and in roughly 44/44/12 — so the middle of the kind roll is
    // the companion.
    const result = await openChestFor(HER, COUPLE, 'gilded', rolls({ kind: 0.6, tier: 0.9 }));
    const prize = only(result);
    expect(prize.kind).toBe('companion');
    const pets = await db.pets.where('memberId').equals(HER).toArray();
    expect(pets.map((p) => p.kindId)).toContain(prize.itemId);
  });

  /**
   * The thing three items per chest introduced, and the reason the owned sets
   * are written to inside the grant loop.
   *
   * All three roll sets here are identical, so all three want the same tier,
   * the same kind and the same slice of the candidate list. Read the owned
   * rows once and leave them alone and this chest hands over one new helmet
   * and two duplicates of it — one prize dressed up as three.
   */
  it('never hands over the same new thing twice in one chest', async () => {
    await withCoins(5000);
    const result = await openChestFor(HER, COUPLE, 'wooden', rolls({ kind: 0 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.prizes.map((prize) => prize.itemId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.prizes.every((prize) => !prize.duplicate)).toBe(true);
  });

  it('prefers something not already owned before repeating itself', async () => {
    await withCoins(200_000);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const result = await openChestFor(HER, COUPLE, 'wooden', rolls({ kind: 0, pick: i / 6 }));
      if (!result.ok) continue;
      for (const prize of result.prizes) {
        if (prize.kind === 'gear' && !prize.duplicate) seen.add(prize.itemId);
      }
    }
    // Five gear slots, five commons. The first few openings should spread
    // rather than refining the same helmet over and over.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('duplicates', () => {
  it('refines gear already owned instead of stacking a second copy', async () => {
    await withCoins(500_000);
    let refinedOnce = false;
    for (let i = 0; i < 40 && !refinedOnce; i += 1) {
      const result = await openChestFor(HER, COUPLE, 'wooden', rolls({ kind: 0, pick: 0.1 }));
      if (!result.ok) continue;
      for (const prize of result.prizes) {
        if (prize.refined === undefined) continue;
        refinedOnce = true;
        const row = await db.inventory.where('[memberId+itemId]')
          .equals([HER, prize.itemId]).first();
        expect(row!.refine).toBeGreaterThanOrEqual(prize.refined);
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
      if (!result.ok) continue;
      for (const prize of result.prizes) {
        if (prize.bonded === undefined) continue;
        bondedOnce = true;
        const pet = (await db.pets.where('memberId').equals(HER).toArray())
          .find((p) => p.kindId === prize.itemId)!;
        expect(pet.bond).toBeGreaterThan(0);
      }
    }
    expect(bondedOnce).toBe(true);
    const pets = await db.pets.where('memberId').equals(HER).toArray();
    expect(new Set(pets.map((p) => p.kindId)).size).toBe(pets.length);
  });

  /** Seven hundred coins must never buy a shrug — now three times over. */
  it('never leaves a paid item with nothing to show for it', async () => {
    await withCoins(500_000);
    for (let i = 0; i < 60; i += 1) {
      const result = await openChestFor(HER, COUPLE, 'silver', rolls({
        kind: (i % 4) / 4, tier: (i % 5) / 5, pick: (i % 3) / 3,
      }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.prizes).toHaveLength(PRIZES_PER_CHEST);
      for (const prize of result.prizes) {
        const gotSomething = !prize.duplicate
          || prize.refined !== undefined
          || prize.bonded !== undefined
          || (prize.refunded ?? 0) > 0;
        expect(gotSomething, `opening ${i}, ${prize.kind} ${prize.itemId}`).toBe(true);
      }
    }
  });

  it('charges what it says and refunds what it says', async () => {
    await withCoins(500_000);
    for (let i = 0; i < 40; i += 1) {
      const before = (await db.avatars.get(HER))!.coins;
      const result = await openChestFor(HER, COUPLE, 'wooden', rolls({
        kind: (i % 5) / 5, tier: (i % 3) / 3, pick: (i % 7) / 7,
      }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const after = (await db.avatars.get(HER))!.coins;
      expect(after).toBe(before - chestPrice('wooden') + result.refunded);
    }
  });

  /**
   * An opening can never pay out more than it cost.
   *
   * Not bookkeeping: every furniture piece is priced 120 or 180, which
   * `tierForPrice` calls `rare`, and the **wooden chest costs 90** and rolls
   * rare decor. Refunded at list price, a couple who owned the furniture set
   * could buy a 90-coin chest and be handed 120 back — and with three items in
   * it, up to 540. See the cap in `openChestFor`.
   */
  it('never refunds more than the chest cost, even owning everything', async () => {
    await withCoins(2_000_000);
    // Own every cosmetic there is, so every decor and dye roll is a duplicate
    // with nothing left to deepen.
    for (const piece of [...FURNITURE, ...DYES]) {
      await db.inventory.put({
        id: `owned-${piece.id}`,
        coupleId: COUPLE,
        memberId: HER,
        itemId: piece.id,
        refine: 0,
        acquiredAt: 1,
        updatedAt: 1,
      });
    }

    for (const chest of CHESTS) {
      for (let i = 0; i < 24; i += 1) {
        const before = (await db.avatars.get(HER))!.coins;
        const result = await openChestFor(HER, COUPLE, chest.id, rolls({
          // Walk the kind roll across the table so decor and dye both come up.
          kind: (i % 8) / 8, tier: (i % 5) / 5, pick: (i % 6) / 6,
        }));
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.refunded, `${chest.id} opening ${i}`)
          .toBeLessThanOrEqual(chest.price);
        expect((await db.avatars.get(HER))!.coins).toBeLessThanOrEqual(before);
      }
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

    // An opening where nothing reached the floor should move only this
    // chest's counter.
    await openChestFor(HER, COUPLE, 'wooden', rolls({ tier: 0.999 }));
    expect(await chestPityFor(HER, 'wooden')).toBe(1);
    expect(await chestPityFor(HER, 'silver')).toBe(0);
    expect(await chestPityFor(HER, 'gilded')).toBe(0);
  });

  /**
   * One step per chest, not one per item.
   *
   * This is what keeps `pityAt` at 6/9/12 meaning what it has always meant,
   * and what keeps every counter already stored on an `Avatar` and synced
   * between two phones comparable with a new one.
   */
  it('steps once for a whole opening, not once per item', async () => {
    await withCoins(100_000);
    await openChestFor(HER, COUPLE, 'wooden', rolls({ tier: 0.999 }));
    expect(await chestPityFor(HER, 'wooden')).toBe(1);
    await openChestFor(HER, COUPLE, 'wooden', rolls({ tier: 0.999 }));
    expect(await chestPityFor(HER, 'wooden')).toBe(2);
  });

  it('clears when anything in the chest pays out', async () => {
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
      expect(floored.floor).toBe(chest.pityTier);
      expect(floored.lifted).toBe(true);
      // One item at or above the floor, and only one: the guarantee is about
      // the chest, not about everything in it.
      const good = floored.prizes
        .filter((prize) => tierRank(prize.tier) >= tierRank(chest.pityTier));
      expect(good).toHaveLength(1);
    }
    expect(await chestPityFor(HER, 'wooden')).toBe(0);
  });

  it('is the same opening from the same rolls and the same counter', async () => {
    await withCoins(100_000);
    const a = await openChestFor(HER, COUPLE, 'silver', rolls());
    await db.avatars.clear();
    await db.inventory.clear();
    await db.pets.clear();
    await withCoins(100_000);
    const b = await openChestFor(HER, COUPLE, 'silver', rolls());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.prizes.map((p) => p.itemId)).toEqual(b.prizes.map((p) => p.itemId));
      expect(a.prizes.map((p) => p.tier)).toEqual(b.prizes.map((p) => p.tier));
    }
  });
});
