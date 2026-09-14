import { db } from '../database';
import type { DayKey, MemberId } from '../../domain/types';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import { refineByItemId } from '../../domain/rpg/inventory';
import { gearBonusWithRefinement } from '../../domain/rpg/shop';
import { petSheet } from '../../domain/rpg/pets';
import type { SkillEffect } from '../../domain/rpg/skills';
import type { Stats } from '../../domain/rpg/types';
import { enemyById } from '../../domain/rpg/enemies';
import { vigourOf, type Vigour } from '../../domain/rpg/vigour';
import { getOrCreateAvatar } from './rpg';
import { awardPetXp } from './petXp';
import { coupleVitals } from './vitals';
import { now } from './shared';

/**
 * The two writes an overworld fight needs, and nothing else.
 *
 * Everything about the fight itself is pure and lives in `domain/rpg/encounter.ts`;
 * this module is the door to Dexie either side of it. It reads a party once
 * before the overlay opens, and settles a victory once after it closes.
 *
 * ## Why there is no table here
 *
 * A fight has exactly two consequences that outlive it, and both already have
 * somewhere to live:
 *
 * - **The shared half** — the pet's XP — goes through `awardPetXp`, which is
 *   already additive, already queued, already deduplicated by award id and
 *   already summed server-side. That is the machinery `petXp.ts` and
 *   `api/study/session.ts` both exist to provide, and reusing it is what makes a
 *   victory safe to report twice.
 * - **The personal half** — the once-ever coin bounty — rides `Avatar.bested`,
 *   the way `visited` already carries the once-ever arrival bounty.
 *
 * So: no Dexie version, no `REKEY_TABLES` entry, no holding kind, no migration.
 * If a visible battle *history* is ever wanted, that is the table, and it should
 * be `encounters: 'id, coupleId, memberId, day, [memberId+day]'` with a
 * `REKEY_TABLES` entry and no `oneRowPerDay` — several fights a day is the point.
 * It is not built here because nobody has asked to read a log of it.
 *
 * ## Why there is no server call
 *
 * `boss_fights` is in D1 because boss HP is *contested additive* state: two
 * phones subtracting damage under last-write-wins would silently discard a hit.
 * An overworld encounter has none of that shape — one person, one phone, HP that
 * never leaves a function call — so a server would have nothing to arbitrate. The
 * protection that is actually needed is idempotence and a ceiling, and both are
 * already written: the deterministic award id below, `awardPetXp`'s own
 * finite-and-non-negative clamp, and `MAX_AWARD_XP` on the endpoint.
 */

/** Everything the reducer needs, gathered in one pass before the overlay opens. */
export interface PartyRead {
  stats: Stats;
  level: number;
  mp: number;
  vigour: Vigour;
  /** The companion's contribution, present only when its skill is actually ready. */
  petEffect?: SkillEffect;
  petId?: string;
  coins: number;
}

/**
 * The party, as it stands today.
 *
 * Composes the same six lines `startAdventure` and the boss panel each already
 * assemble, in one place, so the overlay assembles nothing and holds no rules.
 */
export async function partyFor(
  memberId: MemberId,
  coupleId: string,
  day: DayKey,
): Promise<PartyRead> {
  const avatar = await getOrCreateAvatar(memberId, coupleId);
  const owned = await db.inventory.where('memberId').equals(memberId).toArray();
  const sheet = sheetFor(
    avatar,
    gearBonusWithRefinement(avatar.gear, levelOf(avatar), refineByItemId(owned)),
  );

  const vigour = vigourOf(await coupleVitals(day));

  let petEffect: SkillEffect | undefined;
  let petId: string | undefined;
  if (avatar.companionId) {
    const pet = await db.pets.get(avatar.companionId);
    if (pet) {
      const companion = petSheet(pet);
      // Only when it can actually cast. A sheet that reports a blocked skill is
      // the screen's business; handing a blocked effect to the reducer would be
      // a silent free hit.
      if (companion.skillReady) {
        petEffect = companion.kind.skill.effect;
        petId = pet.id;
      }
    }
  }

  return {
    stats: sheet.stats,
    level: sheet.level,
    mp: sheet.mp,
    vigour,
    petEffect,
    petId,
    coins: sheet.coins,
  };
}

export interface VictoryReceipt {
  ok: boolean;
  reason?: string;
  /** Pet XP credited by this call. Zero when the award was already counted. */
  xp: number;
  /** Coins paid by this call. Zero on every win after the first. */
  coins: number;
  /** True when this was the first time this member beat this enemy. */
  first: boolean;
}

/**
 * The award id for a victory.
 *
 * Deterministic, so the offline queue may resend freely and the ledger's own
 * membership check does the deduplicating — the rule `awardBossVictory` states
 * with `boss-<tier>` and `api/study/session.ts` states with `study-<sessionId>`.
 *
 * Keyed by **member** as well as enemy and day, deliberately. Both halves of the
 * couple beating the same thing on the same day is two people each having done
 * something, and the pet should feel both: every gate in `vitals.ts` — the
 * streak, `bothRecently`, `togetherDays` — is built on the premise that one
 * person cannot raise the bird alone, and deduplicating across the couple here
 * would quietly contradict it. The day still bounds the farm: three enemies is
 * three awards, and beating the same wasp twice before bed is one.
 */
export function victoryAwardId(memberId: MemberId, enemyId: string, day: DayKey): string {
  return `foe-${memberId}-${enemyId}-${day}`;
}

/**
 * Settle a win: credit the shared pet, and pay a first-win bounty once ever.
 *
 * Idempotent by construction rather than by a guard — calling it twice for the
 * same member, enemy and day credits the pet once (the award id) and pays the
 * bounty once (`bested`). The overlay still guards against double-settling, but
 * this function does not depend on it.
 */
export async function settleVictory(
  memberId: MemberId,
  coupleId: string,
  enemyId: string,
  day: DayKey,
): Promise<VictoryReceipt> {
  const enemy = enemyById(enemyId);
  if (!enemy) return { ok: false, reason: 'Nothing was there.', xp: 0, coins: 0, first: false };

  const pet = await db.pet.get(coupleId);
  const alreadyCounted = (pet?.awardedXpIds ?? []).includes(
    victoryAwardId(memberId, enemyId, day),
  );
  await awardPetXp(coupleId, victoryAwardId(memberId, enemyId, day), enemy.xp);

  // One transaction: the bounty and the `bested` entry are the same decision, and
  // a read-modify-write on `avatars` outside one races a sync applying a pulled
  // avatar.
  const first = await db.transaction('rw', db.avatars, async () => {
    const avatar = await getOrCreateAvatar(memberId, coupleId);
    const bested = avatar.bested ?? [];
    if (bested.includes(enemyId)) return false;
    await db.avatars.put({
      ...avatar,
      coins: avatar.coins + enemy.bounty,
      bested: [...bested, enemyId],
      updatedAt: now(),
    });
    return true;
  });

  return {
    ok: true,
    xp: alreadyCounted ? 0 : enemy.xp,
    coins: first ? enemy.bounty : 0,
    first,
  };
}

/** Which enemies this member has beaten before. For the map's "seen it" marks. */
export async function bestedBy(memberId: MemberId): Promise<string[]> {
  const avatar = await db.avatars.get(memberId);
  return avatar?.bested ?? [];
}
