import { db } from '../database';
import type { CoupleId, MemberId } from '../../domain/types';
import {
  candidatesFor, chestById, openChest, pickPrizeId,
  type ChestId, type ChestRolls, type PrizeKind,
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

/** One item out of an opening, after ownership has had its say. */
export interface ChestPrizeOutcome {
  kind: PrizeKind;
  itemId: string;
  /** What it is called, for the reveal. */
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
}

export type ChestOutcome =
  | { ok: false; reason: string }
  | {
    ok: true;
    chestId: ChestId;
    /** The items, in the order they were rolled and granted. Never empty. */
    prizes: ChestPrizeOutcome[];
    /** The chest's counter after this opening. */
    pity: number;
    /** The floor that was in force, and whether it had to step in. */
    floor: Tier | null;
    lifted: boolean;
    /** Everything handed back across the whole opening, in coins. */
    refunded: number;
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
 * replayed exactly. One set per item — `PRIZES_PER_CHEST` of them.
 *
 * One transaction across every table a prize could land in, so a chest is never
 * half-opened — coins gone with nothing granted, or a companion hatched that
 * was never paid for. The wallet is written **once, at the end**, carrying the
 * payment, every refund and the new counter together, so a roll and its counter
 * cannot come apart and three refunds cannot race each other.
 *
 * ## Duplicates
 *
 * A chest you paid seven hundred coins for must never hand back nothing, and
 * with three items in it that guarantee is **per item**: gear you own refines,
 * a companion you own deepens its bond, and a cosmetic you own — which has no
 * second level of ownership, see `buyDye` — is refunded. Each item first
 * prefers something unowned at its tier, so a refund is the last resort rather
 * than the common case.
 *
 * ## Two things three items changed
 *
 * The owned sets are **updated as the loop goes**. Read once and left alone,
 * one chest could hand over the same new rug three times, which is one prize
 * and two duplicates of it dressed up as three prizes.
 *
 * And gear at full refine is refunded a **share** of the price rather than all
 * of it. Refunding the whole chest per item would let somebody who owns
 * everything at that tier turn 700 coins into 2100 — the old single-item rule
 * ("a wasted draw is never a wasted purchase") stays true per share.
 */
export async function openChestFor(
  memberId: MemberId,
  coupleId: CoupleId,
  chestId: string,
  rolls: readonly ChestRolls[],
): Promise<ChestOutcome> {
  const chest = chestById(chestId);
  if (!chest) return { ok: false, reason: 'No such chest.' };
  if (rolls.length === 0) return { ok: false, reason: 'Nothing to roll.' };

  return db.transaction('rw', db.avatars, db.inventory, db.pets, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const check = canAfford(avatar.coins, chest.price);
    if (!check.ok) return { ok: false, reason: check.reason };

    const paid = spend(avatar, { coins: chest.price }, now());
    if (!paid) return { ok: false, reason: 'Not enough coins.' };

    // Luck nudges rarity and nothing else, exactly as it does for an egg.
    const luck = statsFor(paid.xp).luck;
    const pity = paid.chestPity?.[chest.id] ?? 0;
    const opening = openChest(chest, rolls, luck, pity);

    const owned = await db.inventory.where('memberId').equals(memberId).toArray();
    const myPets = await db.pets.where('memberId').equals(memberId).toArray();
    // Mutable, and written to inside the loop -- see the note above.
    const heldItems = new Map(owned.map((row) => [row.itemId, row]));
    const heldPets = new Map(myPets.map((pet) => [pet.kindId, pet]));

    // Floored, not rounded. 260 over three items rounds to 87 each and 261 in
    // total, which is one coin more than the chest cost -- a cap that can be
    // exceeded by rounding is not a cap. Rounding down means an opening where
    // everything was a duplicate refunds a coin or two short of the price,
    // which is the right direction for the house to err.
    const share = Math.floor(chest.price / opening.prizes.length);
    const prizes: ChestPrizeOutcome[] = [];
    let refunded = 0;

    for (const prize of opening.prizes) {
      // Both of these are structurally unreachable while gear and companions
      // run the whole ladder, and both are handled rather than assumed,
      // because "impossible" is a sentence about today's catalogue. Refunding
      // the share is what keeps the never-nothing guarantee per item without
      // voiding the other two.
      if (!prize.kind) { refunded += share; continue; }
      const held = prize.kind === 'companion' ? heldPets : heldItems;
      const unowned = candidatesFor(prize.kind, prize.tier)
        .filter((candidate) => !held.has(candidate));
      const itemId = pickPrizeId(prize.kind, prize.tier, prize.pickRoll, unowned);
      if (!itemId) { refunded += share; continue; }

      const base = {
        kind: prize.kind,
        itemId,
        name: nameOf(prize.kind, itemId) ?? 'Something',
        tier: prize.tier,
      };

      if (prize.kind === 'companion') {
        const existing = heldPets.get(itemId);
        if (existing) {
          const deeper = {
            ...existing,
            bond: existing.bond + DUPLICATE_PET_BOND,
            updatedAt: now(),
          };
          await db.pets.put(deeper);
          heldPets.set(itemId, deeper);
          prizes.push({ ...base, duplicate: true, bonded: DUPLICATE_PET_BOND });
        } else {
          const hatched = {
            id: id(),
            coupleId,
            memberId,
            kindId: itemId,
            bond: 0,
            mp: 0,
            hatchedAt: now(),
            updatedAt: now(),
          };
          await db.pets.put(hatched);
          heldPets.set(itemId, hatched);
          prizes.push({ ...base, duplicate: false });
        }
        continue;
      }

      const existing = heldItems.get(itemId);
      if (!existing) {
        const row = {
          id: id(),
          coupleId,
          memberId,
          itemId,
          refine: 0,
          acquiredAt: now(),
          updatedAt: now(),
        };
        await db.inventory.put(row);
        heldItems.set(itemId, row);
        prizes.push({ ...base, duplicate: false });
        continue;
      }

      if (prize.kind === 'gear' && existing.refine < REFINE_MAX) {
        const refine = existing.refine + 1;
        const row = { ...existing, refine, updatedAt: now() };
        await db.inventory.put(row);
        heldItems.set(itemId, row);
        prizes.push({ ...base, duplicate: true, refined: refine });
        continue;
      }

      // Nothing left to deepen: hand the coins back rather than the shrug,
      // and never more than this item's share of what the chest cost.
      //
      // The cap is not bookkeeping. Every furniture piece is priced 120 or
      // 180, which `tierForPrice` puts at `rare`, and the wooden chest costs
      // **90** and rolls rare decor -- so a couple who owned the furniture set
      // could buy a 90-coin chest and be refunded 120 for it. That was already
      // true of a one-item chest and three items would have made it a sixfold
      // return. "A wasted draw is never a wasted purchase" means you get your
      // money back, not that you profit from owning things.
      const listed = prize.kind === 'gear' ? share : priceOf(prize.kind, itemId);
      const back = Math.min(share, listed);
      refunded += back;
      prizes.push({ ...base, duplicate: true, refunded: back });
    }

    await db.avatars.put({
      ...paid,
      coins: paid.coins + refunded,
      chestPity: { ...(paid.chestPity ?? {}), [chest.id]: opening.pity },
    });

    return {
      ok: true,
      chestId: chest.id,
      prizes,
      pity: opening.pity,
      floor: opening.floor,
      lifted: opening.lifted,
      refunded,
    };
  });
}

/** This member's counter for one chest. Zero when they have never opened it. */
export async function chestPityFor(memberId: MemberId, chestId: string): Promise<number> {
  const avatar = await db.avatars.get(memberId);
  return avatar?.chestPity?.[chestId] ?? 0;
}
