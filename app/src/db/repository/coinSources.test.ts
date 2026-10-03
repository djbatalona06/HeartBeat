import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { claimDailyLogin, getOrCreateAvatar, openPurse, settleGardenClear } from './index';
import { LOGIN_REWARDS, REPLAY_DAILY_CAP, purseRowId, stageCoins } from '../../domain/rpg/coinSources';
import type { DayKey } from '../../domain/types';

const ME = 'member-me';
const COUPLE = 'couple-1';
const DAY = '2026-10-03' as DayKey;

beforeEach(async () => {
  await db.avatars.clear();
  await db.inventory.clear();
});

describe('the daily login award', () => {
  it('pays once a day and not twice', async () => {
    const first = await claimDailyLogin(ME, COUPLE, DAY);
    expect(first?.day).toBe(1);
    expect(await claimDailyLogin(ME, COUPLE, DAY)).toBeNull();
    const avatar = await getOrCreateAvatar(ME, COUPLE);
    expect(avatar.coins).toBeGreaterThanOrEqual(LOGIN_REWARDS[0].coins);
  });

  it('puts a purse in the bag on day seven, exactly once', async () => {
    await getOrCreateAvatar(ME, COUPLE);
    await db.avatars.update(ME, { loginClaims: 6, lastLoginDay: '2026-10-02' });
    const receipt = await claimDailyLogin(ME, COUPLE, DAY);
    expect(receipt?.reward.purse).toBe('purse-fat');
    expect(await db.inventory.get(purseRowId(ME, `login-${DAY}`))).toBeDefined();
    expect(await db.inventory.count()).toBe(1);
  });
});

describe('opening a purse', () => {
  it('pays its coins once, and leaves the row so a sync cannot bring it back', async () => {
    await getOrCreateAvatar(ME, COUPLE);
    await db.avatars.update(ME, { loginClaims: 6 });
    await claimDailyLogin(ME, COUPLE, DAY);
    const row = (await db.inventory.toArray())[0];
    const before = (await db.avatars.get(ME))!.coins;

    expect(await openPurse(ME, row.id)).toBe(110);
    expect((await db.avatars.get(ME))!.coins).toBe(before + 110);
    expect((await db.inventory.get(row.id))?.openedAt).toBeDefined();
    expect(await openPurse(ME, row.id)).toBeNull();
    expect((await db.avatars.get(ME))!.coins).toBe(before + 110);
  });

  it('refuses a purse that is not yours or not a purse', async () => {
    await getOrCreateAvatar(ME, COUPLE);
    await db.inventory.put({
      id: 'x', coupleId: COUPLE, memberId: 'someone-else', itemId: 'purse-small',
      refine: 0, acquiredAt: 1, updatedAt: 1,
    });
    await db.inventory.put({
      id: 'y', coupleId: COUPLE, memberId: ME, itemId: 'dye-house-sparrow',
      refine: 0, acquiredAt: 1, updatedAt: 1,
    });
    expect(await openPurse(ME, 'x')).toBeNull();
    expect(await openPurse(ME, 'y')).toBeNull();
  });
});

describe('a garden win', () => {
  const win = (extra = {}) => ({
    monsterId: 'i1s7-sedentary-sentinel', island: 1, stage: 7, day: DAY,
    coinMultiplier: 1, extraPurses: 0, ...extra,
  });

  it('pays a first clear once, to this member, even if their partner got there first', async () => {
    const first = await settleGardenClear(ME, COUPLE, win());
    expect(first.replay).toBe(false);
    expect(first.coins).toBe(stageCoins(1, 7));
    const again = await settleGardenClear(ME, COUPLE, win());
    expect(again.replay).toBe(true);
  });

  it('doubles the coins and adds the purse when the partner gate was open', async () => {
    const together = await settleGardenClear(ME, COUPLE, win({ coinMultiplier: 2, extraPurses: 1 }));
    expect(together.coins).toBe(stageCoins(1, 7) * 2);
    expect(together.purses).toEqual(['purse-fat']);
    // The same win reported again does not hand over a second purse.
    await settleGardenClear(ME, COUPLE, win({ coinMultiplier: 2, extraPurses: 1 }));
    expect((await db.inventory.toArray()).filter((r) => r.itemId === 'purse-fat')).toHaveLength(1);
  });

  it('drops loot on a replay, capped per day', async () => {
    await settleGardenClear(ME, COUPLE, win());
    let paid = 0;
    for (let i = 0; i < REPLAY_DAILY_CAP + 3; i += 1) {
      paid += (await settleGardenClear(ME, COUPLE, win())).coins > 0 ? 1 : 0;
    }
    expect(paid).toBe(REPLAY_DAILY_CAP);
    const next = await settleGardenClear(ME, COUPLE, win({ day: '2026-10-04' as DayKey }));
    expect(next.coins).toBeGreaterThan(0);
  });

  it('never touches the partner\'s coins', async () => {
    await getOrCreateAvatar('member-them', COUPLE);
    const before = (await db.avatars.get('member-them'))!.coins;
    await settleGardenClear(ME, COUPLE, win());
    expect((await db.avatars.get('member-them'))!.coins).toBe(before);
  });
});
