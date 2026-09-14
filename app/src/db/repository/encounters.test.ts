import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { bestedBy, getOrCreateAvatar, partyFor, settleVictory, victoryAwardId } from './index';
import { enemyById } from '../../domain/rpg/enemies';
import { baseStats, levelOf } from '../../domain/rpg/avatar';
import { STARTER_COINS } from '../../domain/rpg/types';
import { NO_VIGOUR } from '../../domain/rpg/vigour';
import { PET_KINDS } from '../../domain/rpg/pets';

/**
 * The seam where the fight meets storage, which is where the two promises that
 * matter could quietly break: that a victory reported twice credits the shared
 * bird once, and that nothing anywhere subtracts.
 */

const HER = 'member-a';
const HIM = 'member-b';
const COUPLE = 'couple-1';
const DAY = '2026-09-25';
const NEXT_DAY = '2026-09-26';
const SNAIL = enemyById('foe-snail')!;
const MAGPIE = enemyById('foe-magpie')!;

beforeEach(async () => {
  await Promise.all([
    db.avatars.clear(), db.pet.clear(), db.pets.clear(), db.inventory.clear(),
    db.moods.clear(), db.exercises.clear(), db.cycles.clear(),
  ]);
});

const petXp = async () => (await db.pet.get(COUPLE))?.xp ?? 0;
const coinsOf = async (m: string) => (await db.avatars.get(m))?.coins ?? 0;

describe('victoryAwardId', () => {
  it('is deterministic', () => {
    expect(victoryAwardId(HER, 'foe-snail', DAY)).toBe(victoryAwardId(HER, 'foe-snail', DAY));
  });

  it('separates member, enemy and day', () => {
    const base = victoryAwardId(HER, 'foe-snail', DAY);
    expect(victoryAwardId(HIM, 'foe-snail', DAY)).not.toBe(base);
    expect(victoryAwardId(HER, 'foe-wasp', DAY)).not.toBe(base);
    expect(victoryAwardId(HER, 'foe-snail', NEXT_DAY)).not.toBe(base);
  });
});

describe('settleVictory', () => {
  it('credits the shared pet and pays the first-win bounty', async () => {
    const receipt = await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    expect(receipt.ok).toBe(true);
    expect(receipt.first).toBe(true);
    expect(receipt.xp).toBe(SNAIL.xp);
    expect(receipt.coins).toBe(SNAIL.bounty);
    expect(await petXp()).toBe(SNAIL.xp);
    expect(await coinsOf(HER)).toBe(STARTER_COINS + SNAIL.bounty);
  });

  // The one that matters most: both phones may report the same clear.
  it('credits the pet once when the same victory is reported twice', async () => {
    await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    const again = await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    expect(again.xp).toBe(0);
    expect(again.coins).toBe(0);
    expect(again.first).toBe(false);
    expect(await petXp()).toBe(SNAIL.xp);
  });

  it('survives being replayed many times', async () => {
    for (let i = 0; i < 6; i += 1) await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    expect(await petXp()).toBe(SNAIL.xp);
    expect(await coinsOf(HER)).toBe(STARTER_COINS + SNAIL.bounty);
  });

  it('credits again the next day, but never pays the bounty twice', async () => {
    await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    const tomorrow = await settleVictory(HER, COUPLE, SNAIL.id, NEXT_DAY);
    expect(tomorrow.xp).toBe(SNAIL.xp);
    expect(tomorrow.coins).toBe(0);
    expect(tomorrow.first).toBe(false);
    expect(await petXp()).toBe(SNAIL.xp * 2);
    expect(await coinsOf(HER)).toBe(STARTER_COINS + SNAIL.bounty);
  });

  // The design call: both halves of the couple doing something is two things done.
  it('counts both partners beating the same thing on the same day', async () => {
    await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    const his = await settleVictory(HIM, COUPLE, SNAIL.id, DAY);
    expect(his.xp).toBe(SNAIL.xp);
    expect(await petXp()).toBe(SNAIL.xp * 2);
  });

  it('pays each partner their own first-win bounty', async () => {
    await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    await settleVictory(HIM, COUPLE, SNAIL.id, DAY);
    expect(await coinsOf(HER)).toBe(STARTER_COINS + SNAIL.bounty);
    expect(await coinsOf(HIM)).toBe(STARTER_COINS + SNAIL.bounty);
  });

  it('tracks each enemy separately', async () => {
    await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    const magpie = await settleVictory(HER, COUPLE, MAGPIE.id, DAY);
    expect(magpie.first).toBe(true);
    expect(await petXp()).toBe(SNAIL.xp + MAGPIE.xp);
    expect(await bestedBy(HER)).toEqual([SNAIL.id, MAGPIE.id]);
  });

  it('refuses an unknown enemy without writing anything', async () => {
    const receipt = await settleVictory(HER, COUPLE, 'foe-nothing', DAY);
    expect(receipt.ok).toBe(false);
    expect(receipt.xp).toBe(0);
    expect(await petXp()).toBe(0);
  });

  // The ruling, at the storage seam.
  it('never subtracts coins or pet XP', async () => {
    await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    const coins = await coinsOf(HER);
    const xp = await petXp();
    for (const day of [DAY, NEXT_DAY, DAY]) {
      await settleVictory(HER, COUPLE, SNAIL.id, day);
      expect(await coinsOf(HER)).toBeGreaterThanOrEqual(coins);
      expect(await petXp()).toBeGreaterThanOrEqual(xp);
    }
  });

  it('writes no health field anywhere', async () => {
    await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    const avatar = await db.avatars.get(HER);
    expect(Object.keys(avatar!)).not.toContain('hp');
    expect(Object.keys(avatar!)).not.toContain('health');
  });
});

describe('bestedBy', () => {
  it('is empty for a member who has never fought', async () => {
    expect(await bestedBy('member-new')).toEqual([]);
  });

  it('records a win once', async () => {
    await settleVictory(HER, COUPLE, SNAIL.id, DAY);
    await settleVictory(HER, COUPLE, SNAIL.id, NEXT_DAY);
    expect(await bestedBy(HER)).toEqual([SNAIL.id]);
  });
});

describe('partyFor', () => {
  it('mints an avatar for a member who has never played', async () => {
    const party = await partyFor(HER, COUPLE, DAY);
    expect(party.level).toBe(1);
    expect(party.stats).toEqual(baseStats(1));
    expect(party.coins).toBe(STARTER_COINS);
    expect(await db.avatars.get(HER)).toBeDefined();
  });

  it('reports vigour, and nothing logged is the plain fight', async () => {
    const party = await partyFor(HER, COUPLE, DAY);
    expect(party.vigour).toEqual(NO_VIGOUR);
    expect(party.vigour.plain).toBe(true);
  });

  it('lifts vigour once something is logged', async () => {
    await db.moods.put({
      id: 'mood-1', memberId: HER, day: DAY, energy: 4, stress: 2, affection: 5, updatedAt: 1,
    });
    const party = await partyFor(HER, COUPLE, DAY);
    expect(party.vigour.plain).toBe(false);
    expect(party.vigour.bonus.strength).toBeGreaterThan(0);
  });

  it('rises with level', async () => {
    const avatar = await getOrCreateAvatar(HER, COUPLE);
    await db.avatars.put({ ...avatar, xp: 5000, updatedAt: 2 });
    const party = await partyFor(HER, COUPLE, DAY);
    expect(party.level).toBe(levelOf({ ...avatar, xp: 5000 }));
    expect(party.stats.strength).toBeGreaterThan(1);
  });

  it('carries no pet effect without a companion', async () => {
    expect((await partyFor(HER, COUPLE, DAY)).petEffect).toBeUndefined();
  });

  it('carries the companion effect only when its skill is ready', async () => {
    const kind = PET_KINDS.find((k) => k.skill.minRank <= 1)!;
    const avatar = await getOrCreateAvatar(HER, COUPLE);
    await db.pets.put({
      id: 'pet-1', coupleId: COUPLE, memberId: HER, kindId: kind.id,
      bond: 0, mp: kind.skill.mpCost, hatchedAt: 1, updatedAt: 1,
    });
    await db.avatars.put({ ...avatar, companionId: 'pet-1', updatedAt: 2 });
    expect((await partyFor(HER, COUPLE, DAY)).petEffect).toEqual(kind.skill.effect);

    // Drained, so the skill is blocked and the effect must not be handed over.
    await db.pets.update('pet-1', { mp: 0 });
    expect((await partyFor(HER, COUPLE, DAY)).petEffect).toBeUndefined();
  });

  it('ignores a companion id pointing at a pet that is gone', async () => {
    const avatar = await getOrCreateAvatar(HER, COUPLE);
    await db.avatars.put({ ...avatar, companionId: 'pet-missing', updatedAt: 2 });
    const party = await partyFor(HER, COUPLE, DAY);
    expect(party.petEffect).toBeUndefined();
    expect(party.petId).toBeUndefined();
  });
});
