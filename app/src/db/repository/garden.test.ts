import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { buyFlora, getOrCreateAvatar, ownedFlora, plantFlora } from './index';
import { FLORA, PLOTS, plotsAt } from '../../domain/rpg/plots';
import { MAX_LEVEL, xpForLevel } from '../../domain/xp';

const HER = 'member-a';
const COUPLE = 'couple-1';
const ROSE = FLORA[0];
const DOORSTEP = PLOTS[0].id;
const LATE_PLOT = PLOTS[PLOTS.length - 1].id;

beforeEach(async () => {
  await Promise.all([db.avatars.clear(), db.inventory.clear(), db.pet.clear()]);
});

async function withCoins(coins: number) {
  const avatar = await getOrCreateAvatar(HER, COUPLE);
  await db.avatars.put({ ...avatar, coins });
}

async function atLevel(level: number) {
  await db.pet.put({
    coupleId: COUPLE, level, xp: xpForLevel(level), mood: 'content', fedAt: 0,
  });
}

describe('buying something to plant', () => {
  it('refuses, and says how short, rather than going into debt', async () => {
    await withCoins(5);
    const result = await buyFlora(HER, COUPLE, ROSE.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('more coins');
    expect((await db.avatars.get(HER))!.coins).toBe(5);
  });

  it('takes the price and files the row', async () => {
    await withCoins(1000);
    expect((await buyFlora(HER, COUPLE, ROSE.id)).ok).toBe(true);
    expect((await db.avatars.get(HER))!.coins).toBe(1000 - ROSE.price);
    expect(await ownedFlora(HER)).toEqual([ROSE.id]);
  });

  /** No second level of owning a rose bush. */
  it('refuses a duplicate instead of charging twice for nothing', async () => {
    await withCoins(5000);
    await buyFlora(HER, COUPLE, ROSE.id);
    const before = (await db.avatars.get(HER))!.coins;
    const second = await buyFlora(HER, COUPLE, ROSE.id);
    expect(second.ok).toBe(false);
    expect((await db.avatars.get(HER))!.coins).toBe(before);
  });

  it('refuses a plant nobody sells, without touching the wallet', async () => {
    await withCoins(900);
    expect((await buyFlora(HER, COUPLE, 'flora-triffid')).ok).toBe(false);
    expect((await db.avatars.get(HER))!.coins).toBe(900);
  });

  it('keeps flora apart from the gear in the same table', async () => {
    await withCoins(5000);
    await db.inventory.put({
      id: 'x', coupleId: COUPLE, memberId: HER, itemId: 'head-paper-crown',
      refine: 0, acquiredAt: 0, updatedAt: 0,
    });
    await buyFlora(HER, COUPLE, ROSE.id);
    expect(await ownedFlora(HER)).toEqual([ROSE.id]);
  });
});

describe('planting', () => {
  beforeEach(async () => {
    await withCoins(50_000);
    await buyFlora(HER, COUPLE, ROSE.id);
  });

  it('puts it in the ground, on the couple\'s row so it lands for both', async () => {
    await atLevel(MAX_LEVEL);
    expect((await plantFlora(HER, COUPLE, DOORSTEP, ROSE.id)).ok).toBe(true);
    expect((await db.pet.get(COUPLE))!.plots).toEqual({ [DOORSTEP]: ROSE.id });
  });

  it('refuses ground the couple has not levelled into, and says so by name', async () => {
    await atLevel(2);
    const result = await plantFlora(HER, COUPLE, LATE_PLOT, ROSE.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('higher level');
  });

  it('refuses a plant that was never bought', async () => {
    await atLevel(MAX_LEVEL);
    const result = await plantFlora(HER, COUPLE, DOORSTEP, FLORA[1].id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('not yours');
  });

  it('refuses ground that does not exist', async () => {
    await atLevel(MAX_LEVEL);
    expect((await plantFlora(HER, COUPLE, 'plot-the-moon', ROSE.id)).ok).toBe(false);
  });

  it('clears a plot when handed nothing', async () => {
    await atLevel(MAX_LEVEL);
    await plantFlora(HER, COUPLE, DOORSTEP, ROSE.id);
    expect((await plantFlora(HER, COUPLE, DOORSTEP, undefined)).ok).toBe(true);
    expect((await db.pet.get(COUPLE))!.plots).toEqual({});
  });

  /**
   * The level is derived inside the write rather than taken as an argument, so
   * a screen holding a stale level cannot plant in ground nobody has reached.
   */
  it('reads the level from the pet row, not from the caller', async () => {
    await atLevel(2);
    expect(plotsAt(2)).toHaveLength(1);
    expect((await plantFlora(HER, COUPLE, LATE_PLOT, ROSE.id)).ok).toBe(false);
    await atLevel(MAX_LEVEL);
    expect((await plantFlora(HER, COUPLE, LATE_PLOT, ROSE.id)).ok).toBe(true);
  });

  it('creates the pet row when a couple plants before anything else', async () => {
    await db.pet.clear();
    // Level 1 reaches no ground at all, so this is the honest refusal — and
    // importantly it does not throw on a missing pet row.
    const result = await plantFlora(HER, COUPLE, DOORSTEP, ROSE.id);
    expect(result.ok).toBe(false);
  });

  it('leaves the pet\'s XP alone when it writes the ground', async () => {
    await atLevel(MAX_LEVEL);
    const before = (await db.pet.get(COUPLE))!.xp;
    await plantFlora(HER, COUPLE, DOORSTEP, ROSE.id);
    expect((await db.pet.get(COUPLE))!.xp).toBe(before);
  });
});
