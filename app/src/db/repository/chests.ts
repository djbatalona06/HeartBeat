import { db } from '../database';
import type { CoupleId, MemberId } from '../../domain/types';
import {
  candidatesFor, chestById, openChest, pickPrizeId,
  type ChestDraw, type ChestRolls, type PrizeKind,
} from '../../domain/rpg/chests';
import { gearById } from '../../domain/rpg/gear';
import { petKindById } from '../../domain/rpg/pets';
import { furnitureById } from '../../domain/rpg/furniture';
import { dyeById } from '../../domain/rpg/dyes';
import { DUPLICATE_PET_BOND, REFINE_MAX, canAfford } from '../../domain/rpg/shop';
import { spend, statsFor } from '../../domain/rpg/avatar';
import { type Tier } from '../../domain/rpg/tiers';
import { id, now } from './shared';
import { getOrCreateAvatar } from './rpg';

/* -- chests ------------------------------------------------------------------
 * The one place a chest is paid for and a prize lands.
 *
 * `domain/rpg/chests.ts` decides the odds and describes a prize — a tier, a
 * kind, and two rolls. It deliberately stops there, because the last step
 * depends on what this member already owns, and ownership is a question only a
 * repository can answer. That split is what lets the odds be tested exhaustively
 * without a database anywhere near them.
 */

export type ChestOutcome =
  | { ok: false; reason: string }
  | {
    ok: true;
    draw: ChestDraw;
    kind: PrizeKind;
    itemId: string;
    /** What it is called, for the banner. */
    name: string;
    tier: Tier;
    /** True when this landed on something already owned. */
    duplicate: boolean;
    /** Set when a duplicate raised an existing item instead of adding one. */
    refined?: number;
    /** Set when a duplicate deepened a companion's bond instead. */
    bonded?: number;
    /** Coins handed back when a duplicate could do neither. */
    refunded?: number;
  };

/** The name a prize goes by, whichever catalogue it came out of. */
function nameOf(kind: PrizeKind, itemId: string): string | undefined {
  switch (kind) {
    case 'gear': return gearById(itemId)?.name;
    case 'companion': return petKindById(itemId)?.name;
    case 'decor': return furnitureById(itemId)?.name;
    case 'dye': return dyeById(itemId)?.name;
    default: return undefined;
  }
}

/** What a duplicate cosmetic is worth back, since there is no second level of
 *  owning a rug. Its list price, so a wasted draw is never a wasted purchase. */
function priceOf(kind: PrizeKind, itemId: string): number {
  if (kind === 'decor') return furnitureById(itemId)?.price ?? 0;
  if (kind === 'dye') return dyeById(itemId)?.price ?? 0;
  return 0;
}

/**
 * Open one.
 *
 * Rolls are passed in rather than taken here, for the reason `buyEgg` gives:
 * the caller owns the randomness, so a draw somebody thinks is wrong can be
 * replayed exactly.
 *
 * One transaction across every table a prize could land in, so a chest is never
 * half-opened — coins gone with nothing granted, or a companion hatched that
 * was never paid for. The pity counter is written on the same `put` the payment
 * makes, so a roll and its counter cannot come apart.
 *
 * ## Duplicates
 *
 * A chest you paid seven hundred coins for must never hand back nothing. So:
 * gear you own refines, a companion you own deepens its bond, and a cosmetic
 * you own — which has no second level of ownership, see `buyDye` — is refunded
 * at its list price. The draw first prefers something unowned at that tier, so
 * the refund is the last resort rather than the common case.
 */
export async function openChestFor(
  memberId: MemberId,
  coupleId: CoupleId,
  chestId: string,
  rolls: ChestRolls,
): Promise<ChestOutcome> {
  const chest = chestById(chestId);
  if (!chest) return { ok: false, reason: 'No such chest.' };

  return db.transaction('rw', db.avatars, db.inventory, db.pets, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const check = canAfford(avatar.coins, chest.price);
    if (!check.ok) return { ok: false, reason: check.reason };

    const paid = spend(avatar, { coins: chest.price }, now());
    if (!paid) return { ok: false, reason: 'Not enough coins.' };

    // Luck nudges rarity and nothing else, exactly as it does for an egg.
    const luck = statsFor(paid.xp).luck;
    const pity = paid.chestPity?.[chest.id] ?? 0;
    const draw = openChest(chest, rolls, luck, pity);

    await db.avatars.put({
      ...paid,
      chestPity: { ...(paid.chestPity ?? {}), [chest.id]: draw.pity },
    });

    if (!draw.kind) {
      // Structurally unreachable while gear and companions run the whole
      // ladder, and handled anyway: taking the coins and granting nothing is
      // the one outcome this function must never have.
      return { ok: false, reason: 'That chest had nothing to give. Nothing was spent.' };
    }

    const owned = await db.inventory.where('memberId').equals(memberId).toArray();
    const ownedIds = new Set(owned.map((row) => row.itemId));
    const myPets = await db.pets.where('memberId').equals(memberId).toArray();
    const ownedKinds = new Set(myPets.map((pet) => pet.kindId));

    // Statically imported, deliberately: an `await` on anything that is not a
    // Dexie promise leaves the transaction zone, and a dynamic import here
    // would end the transaction halfway through paying for a chest.
    const held = draw.kind === 'companion' ? ownedKinds : ownedIds;
    const unowned = candidatesFor(draw.kind, draw.tier).filter((candidate) => !held.has(candidate));
    const itemId = pickPrizeId(draw.kind, draw.tier, draw.pickRoll, unowned);
    if (!itemId) return { ok: false, reason: 'That chest had nothing to give. Nothing was spent.' };

    const name = nameOf(draw.kind, itemId) ?? 'Something';
    const base = { ok: true as const, draw, kind: draw.kind, itemId, name, tier: draw.tier };

    if (draw.kind === 'companion') {
      const existing = myPets.find((pet) => pet.kindId === itemId);
      if (existing) {
        await db.pets.put({
          ...existing,
          bond: existing.bond + DUPLICATE_PET_BOND,
          updatedAt: now(),
        });
        return { ...base, duplicate: true, bonded: DUPLICATE_PET_BOND };
      }
      await db.pets.put({
        id: id(),
        coupleId,
        memberId,
        kindId: itemId,
        bond: 0,
        mp: 0,
        hatchedAt: now(),
        updatedAt: now(),
      });
      return { ...base, duplicate: false };
    }

    const existing = owned.find((row) => row.itemId === itemId);
    if (!existing) {
      await db.inventory.put({
        id: id(),
        coupleId,
        memberId,
        itemId,
        refine: 0,
        acquiredAt: now(),
        updatedAt: now(),
      });
      return { ...base, duplicate: false };
    }

    if (draw.kind === 'gear' && existing.refine < REFINE_MAX) {
      const refine = existing.refine + 1;
      await db.inventory.put({ ...existing, refine, updatedAt: now() });
      return { ...base, duplicate: true, refined: refine };
    }

    // Nothing left to deepen: hand the coins back rather than the shrug.
    const refunded = draw.kind === 'gear' ? chest.price : priceOf(draw.kind, itemId);
    const wallet = await db.avatars.get(memberId);
    if (wallet) {
      await db.avatars.put({ ...wallet, coins: wallet.coins + refunded, updatedAt: now() });
    }
    return { ...base, duplicate: true, refunded };
  });
}

/** This member's counter for one chest. Zero when they have never opened it. */
export async function chestPityFor(memberId: MemberId, chestId: string): Promise<number> {
  const avatar = await db.avatars.get(memberId);
  return avatar?.chestPity?.[chestId] ?? 0;
}
