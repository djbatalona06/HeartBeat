import { db } from '../database';
import type { DayKey, MemberId } from '../../domain/types';
import { applyPayout } from '../../domain/rpg/avatar';
import {
  claimLogin, purseById, purseRowId, replayAllowance, replayLoot, stageCoins,
  type LoginReward,
} from '../../domain/rpg/coinSources';
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
