import { describe, expect, it } from 'vitest';
import {
  LOGIN_CYCLE, LOGIN_REWARDS, PURSES, REPEAT_WIN_DAILY_CAP, REPLAY_DAILY_CAP,
  claimLogin, isPurseItem, loginPopupOpen, loginState, purseById, purseRowId, repeatWinCoins,
  replayAllowance, replayLoot, stageCoins, unopened,
} from './coinSources';
import { GEAR_PRICE } from './shop';
import type { Avatar } from './types';
import type { DayKey } from '../types';

const DAY = '2026-10-03' as DayKey;
const NEXT = '2026-10-04' as DayKey;
const avatar = (extra: Partial<Avatar> = {}): Avatar => ({
  memberId: 'me', coupleId: 'c', xp: 0, coins: 100, energy: 0, mp: 0, gear: {}, updatedAt: 0, ...extra,
} as Avatar);

describe('purses', () => {
  it('are in the catalogue under the purse prefix, and nothing else is', () => {
    for (const purse of PURSES) {
      expect(isPurseItem(purse.id)).toBe(true);
      expect(purseById(purse.id)).toBe(purse);
    }
    expect(isPurseItem('dye-house-sparrow')).toBe(false);
    expect(purseById('nope')).toBeUndefined();
  });

  it('open for more the bigger they are, and never for nothing', () => {
    const coins = PURSES.map((p) => p.coins);
    expect([...coins].sort((a, b) => a - b)).toEqual(coins);
    expect(Math.min(...coins)).toBeGreaterThan(0);
  });

  it('are not for sale: no shop price list carries one', () => {
    for (const purse of PURSES) expect(Object.keys(GEAR_PRICE)).not.toContain(purse.id);
  });

  it('get the same row id from the same source, so a retry is not a second purse', () => {
    expect(purseRowId('me', 'login-2026-10-03')).toBe(purseRowId('me', 'login-2026-10-03'));
    expect(purseRowId('me', 'a')).not.toBe(purseRowId('them', 'a'));
  });

  it('are unopened until marked, and only purses count', () => {
    const rows = [
      { itemId: 'purse-small' }, { itemId: 'purse-fat', openedAt: 5 }, { itemId: 'dye-x' },
    ];
    expect(unopened(rows)).toEqual([{ itemId: 'purse-small' }]);
  });
});

describe('the seven-day login award', () => {
  it('has seven days, each paying at least as much as the one before, and a purse on the last', () => {
    expect(LOGIN_REWARDS).toHaveLength(LOGIN_CYCLE);
    const coins = LOGIN_REWARDS.map((r) => r.coins);
    expect([...coins].sort((a, b) => a - b)).toEqual(coins);
    expect(LOGIN_REWARDS[LOGIN_CYCLE - 1].purse).toBeDefined();
    for (const reward of LOGIN_REWARDS) if (reward.purse) expect(purseById(reward.purse)).toBeDefined();
  });

  it('starts at day one and pays it once a day', () => {
    const first = claimLogin(avatar(), DAY, 1)!;
    expect(first.day).toBe(1);
    expect(first.avatar.coins).toBe(100 + LOGIN_REWARDS[0].coins);
    expect(claimLogin(first.avatar, DAY, 2)).toBeNull();
    expect(loginState(first.avatar, DAY).claimable).toBe(false);
    expect(loginState(first.avatar, NEXT).day).toBe(2);
  });

  it('does not punish a gap: a missed week is the same next day', () => {
    const after = claimLogin(avatar({ loginClaims: 2, lastLoginDay: '2026-09-01' }), DAY, 1)!;
    expect(after.day).toBe(3);
  });

  it('wraps to day one after day seven', () => {
    const seventh = claimLogin(avatar({ loginClaims: 6, lastLoginDay: '2026-10-02' }), DAY, 1)!;
    expect(seventh.day).toBe(7);
    expect(seventh.reward.purse).toBeDefined();
    expect(loginState(seventh.avatar, NEXT).day).toBe(1);
  });
});

describe('garden coins', () => {
  it('pay more for harder stages and further islands', () => {
    expect(stageCoins(1, 7)).toBeGreaterThan(stageCoins(1, 1));
    expect(stageCoins(10, 7)).toBeGreaterThan(stageCoins(1, 7));
    expect(stageCoins(1, 1)).toBeGreaterThan(0);
  });

  it('roll the same replay loot every time for the same drop', () => {
    expect(replayLoot('me', 'i3s7-x', 3, DAY, 0)).toEqual(replayLoot('me', 'i3s7-x', 3, DAY, 0));
  });

  it('always drop coins, sometimes a purse that exists, and a rare one only deep in the world', () => {
    let purses = 0;
    for (let n = 0; n < 400; n += 1) {
      const loot = replayLoot(`m${n}`, 'i2s7-boss', 2, DAY, n % 3);
      expect(loot.coins).toBeGreaterThan(0);
      if (loot.purse) { purses += 1; expect(purseById(loot.purse)).toBeDefined(); expect(loot.purse).toBe('purse-small'); }
    }
    expect(purses).toBeGreaterThan(40);
    expect(purses).toBeLessThan(160);
  });

  it('caps replay drops per day and resets on a new day', () => {
    expect(replayAllowance({}, DAY)).toEqual({ left: REPLAY_DAILY_CAP, used: 0 });
    expect(replayAllowance({ replayDay: DAY, replayCount: 2 }, DAY).left).toBe(REPLAY_DAILY_CAP - 2);
    expect(replayAllowance({ replayDay: DAY, replayCount: 9 }, DAY).left).toBe(0);
    expect(replayAllowance({ replayDay: DAY, replayCount: 9 }, NEXT).left).toBe(REPLAY_DAILY_CAP);
  });
});

describe('the overworld trickle', () => {
  it('pays a quarter of the bounty, at least one coin', () => {
    expect(repeatWinCoins(20, {}, DAY)).toBe(5);
    expect(repeatWinCoins(2, {}, DAY)).toBe(1);
  });

  it('stops at the daily cap and never goes negative', () => {
    expect(repeatWinCoins(20, { foeCoinsDay: DAY, foeCoinsPaid: REPEAT_WIN_DAILY_CAP - 2 }, DAY)).toBe(2);
    expect(repeatWinCoins(20, { foeCoinsDay: DAY, foeCoinsPaid: REPEAT_WIN_DAILY_CAP + 50 }, DAY)).toBe(0);
    expect(repeatWinCoins(20, { foeCoinsDay: DAY, foeCoinsPaid: REPEAT_WIN_DAILY_CAP }, NEXT)).toBe(5);
  });
});

describe('the login popup', () => {
  const base = { claimable: true, day: '2026-10-05', putOffOn: null, showingReceipt: false };

  it('opens while today is unclaimed', () => {
    expect(loginPopupOpen(base)).toBe(true);
  });

  it('stays shut once claimed, and once put off today', () => {
    expect(loginPopupOpen({ ...base, claimable: false })).toBe(false);
    expect(loginPopupOpen({ ...base, putOffOn: '2026-10-05' })).toBe(false);
  });

  it('comes back the next day after being put off', () => {
    expect(loginPopupOpen({ ...base, day: '2026-10-06', putOffOn: '2026-10-05' })).toBe(true);
  });

  it('stays open on the receipt even though nothing is claimable any more', () => {
    expect(loginPopupOpen({ ...base, claimable: false, showingReceipt: true })).toBe(true);
  });
});
