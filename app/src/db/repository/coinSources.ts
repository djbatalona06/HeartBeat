import { db } from '../database';
import type { DayKey, MemberId } from '../../domain/types';
import { applyPayout } from '../../domain/rpg/avatar';
import {
  claimLogin, purseById, purseRowId, replayAllowance, replayLoot, stageCoins,
  type LoginReward,
} from '../../domain/rpg/coinSources';
import { starMilestone } from '../../domain/rpg/starChests';
import { bossSpinSource, dailySpinSource, rollWheel, spinRoll, type WheelSegment } from '../../domain/rpg/wheel';
import { getOrCreateAvatar } from './rpg';
import { now } from './shared';

/**
 * Where the Dexie half of the coin sources lives; the rules are in
 * `domain/rpg/coinSources.ts`.
 *
 * Every purse is its own inventory row with an id derived from where it came
 * from, so granting the same one twice is one row, and **opening marks the row
 * rather than deleting it** — holdings sync has no tombstones, and a deleted row
 * is simply recreated by the next pull. Nothing here awaits anything but Dexie
 * inside a transaction.
 */

type Tx = typeof db;

/** Put a purse in the bag unless this exact one is already there. */
async function grantPurse(
  tx: Tx,
  memberId: MemberId,
  coupleId: string,
  itemId: string,
  source: string,
): Promise<boolean> {
  if (!purseById(itemId)) return false;
  const id = purseRowId(memberId, source);
  if (await tx.inventory.get(id)) return false;
  const at = now();
  await tx.inventory.put({ id, coupleId, memberId, itemId, refine: 0, acquiredAt: at, updatedAt: at });
  return true;
}

export interface LoginReceipt {
  day: number;
  reward: LoginReward;
}

/** Take today's login award, or null if it has been taken. Once a day, in the member's own zone. */
export async function claimDailyLogin(
  memberId: MemberId,
  coupleId: string,
  day: DayKey,
): Promise<LoginReceipt | null> {
  return db.transaction('rw', db.avatars, db.inventory, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const claim = claimLogin(avatar, day, now());
    if (!claim) return null;
    await db.avatars.put(claim.avatar);
    if (claim.reward.purse) {
      await grantPurse(db, memberId, coupleId, claim.reward.purse, `login-${day}`);
    }
    return { day: claim.day, reward: claim.reward };
  });
}

/** Open a purse for its coins. Null when it is not yours, not a purse, or already open. */
export async function openPurse(memberId: MemberId, rowId: string): Promise<number | null> {
  return db.transaction('rw', db.avatars, db.inventory, async () => {
    const row = await db.inventory.get(rowId);
    const purse = row ? purseById(row.itemId) : undefined;
    if (!row || !purse || row.memberId !== memberId || row.openedAt !== undefined) return null;

    const avatar = await getOrCreateAvatar(memberId, row.coupleId);
    await db.avatars.put(applyPayout(avatar, { xp: 0, coins: purse.coins, energy: 0, mp: 0 }, now()));
    await db.inventory.put({ ...row, openedAt: now(), updatedAt: now() });
    return purse.coins;
  });
}

export interface GardenClear {
  monsterId: string;
  island: number;
  stage: number;
  day: DayKey;
  /** From the partner gate, frozen when the fight began. 1 when alone. */
  coinMultiplier: number;
  /** Purses the partner gate adds to a first clear. */
  extraPurses: number;
}

export interface GardenLoot {
  coins: number;
  purses: string[];
  /** True when this member had beaten it before. */
  replay: boolean;
}

/**
 * Pay a member for a garden win: coins for a first clear of the stage, and
 * loot for going back to a boss they have already beaten.
 *
 * Per member, in one transaction, and keyed on the member's own record
 * (`gardenBested`) rather than on the couple's world row — a stage your partner
 * beat first still pays you for yours, and a win reported twice pays once.
 */
export async function settleGardenClear(
  memberId: MemberId,
  coupleId: string,
  win: GardenClear,
): Promise<GardenLoot> {
  return db.transaction('rw', db.avatars, db.inventory, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const bested = avatar.gardenBested ?? [];
    const purses: string[] = [];
    const times = (coins: number) => Math.round(coins * Math.max(1, win.coinMultiplier));
    const at = now();

    if (!bested.includes(win.monsterId)) {
      const coins = times(stageCoins(win.island, win.stage));
      await db.avatars.put({
        ...avatar, coins: avatar.coins + coins, gardenBested: [...bested, win.monsterId], updatedAt: at,
      });
      if (win.extraPurses > 0) {
        for (let i = 0; i < win.extraPurses; i += 1) {
          if (await grantPurse(db, memberId, coupleId, 'purse-fat', `together-${win.monsterId}-${i}`)) {
            purses.push('purse-fat');
          }
        }
      }
      return { coins, purses, replay: false };
    }

    const { left, used } = replayAllowance(avatar, win.day);
    if (left <= 0) return { coins: 0, purses, replay: true };

    const loot = replayLoot(memberId, win.monsterId, win.island, win.day, used);
    const coins = times(loot.coins);
    await db.avatars.put({
      ...avatar, coins: avatar.coins + coins, replayDay: win.day, replayCount: used + 1, updatedAt: at,
    });
    if (loot.purse && await grantPurse(db, memberId, coupleId, loot.purse, `replay-${win.monsterId}-${win.day}-${used}`)) {
      purses.push(loot.purse);
    }
    return { coins, purses, replay: true };
  });
}

/* -- the reward wheel --------------------------------------------------------- */

export interface WheelSpin {
  segment: WheelSegment;
  coins: number;
  purse: string;
}

/**
 * Spin for a source, once. The prize is a purse row whose id is made from the
 * source, which is both what makes a retry (or the same member's other phone)
 * the same row and what says "already spun"; it is stored already opened, and
 * its coins are paid in the same transaction. Null when this source was spun.
 */
async function spinFor(memberId: MemberId, coupleId: string, source: string): Promise<WheelSpin | null> {
  const id = purseRowId(memberId, source);
  if (await db.inventory.get(id)) return null;
  const segment = rollWheel(spinRoll(memberId, source));
  const purse = purseById(segment.purse);
  if (!purse) return null;
  const avatar = await getOrCreateAvatar(memberId, coupleId);
  const at = now();
  await db.avatars.put(applyPayout(avatar, { xp: 0, coins: purse.coins, energy: 0, mp: 0 }, at));
  await db.inventory.put({
    id, coupleId, memberId, itemId: purse.id, refine: 0, acquiredAt: at, updatedAt: at, openedAt: at,
  });
  return { segment, coins: purse.coins, purse: purse.id };
}

/** Today's free spin. Once a day, in the member's own zone. */
export async function spinDailyWheel(memberId: MemberId, coupleId: string, day: DayKey): Promise<WheelSpin | null> {
  return db.transaction('rw', db.avatars, db.inventory, () => spinFor(memberId, coupleId, dailySpinSource(day)));
}

/**
 * The bonus spin for a boss. Only for an island boss the couple has actually
 * cleared, and once per boss per member, so there are as many as there are
 * bosses and no more.
 */
export async function spinBossWheel(memberId: MemberId, coupleId: string, monsterId: string): Promise<WheelSpin | null> {
  if (starMilestone(monsterId)?.chestId !== 'gilded') return null;
  return db.transaction('rw', db.avatars, db.inventory, db.worldProgress, async () => {
    const world = await db.worldProgress.get(coupleId);
    if (!world?.cleared.includes(monsterId)) return null;
    return spinFor(memberId, coupleId, bossSpinSource(monsterId));
  });
}

/** Whether a spin has been taken (or a boss spin is still waiting), for the button's state. */
export async function hasSpun(memberId: MemberId, source: string): Promise<boolean> {
  return (await db.inventory.get(purseRowId(memberId, source))) !== undefined;
}

/* -- island skirmishes -------------------------------------------------------- */

/**
 * Note a skirmish win for today. True the first time for that skirmish on that
 * day (so it pays its XP), false after, which is what makes them worth
 * walking into once a day and no more. Per member, on the member's own avatar,
 * so a partner's win never spends yours.
 */
export async function recordMinionWin(
  memberId: MemberId,
  coupleId: string,
  day: DayKey,
  monsterId: string,
): Promise<boolean> {
  return db.transaction('rw', db.avatars, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const beaten = avatar.minionDay === day ? avatar.minionsBeaten ?? [] : [];
    if (beaten.includes(monsterId)) return false;
    await db.avatars.put({ ...avatar, minionDay: day, minionsBeaten: [...beaten, monsterId], updatedAt: now() });
    return true;
  });
}
