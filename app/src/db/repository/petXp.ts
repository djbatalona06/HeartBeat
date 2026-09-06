import { db } from '../database';
import type { MemberId, Pet, PetXpAward } from '../../domain/types';
import { MAX_AWARD_XP } from '../../domain/types';
import { tierScale } from '../../domain/rpg/boss';
import { id, now } from './shared';


/**
 * XP into the shared pet.
 *
 * Two things are true here that were not before. The amount is clamped to a
 * gain: the pet is the couple's, and no ordinary day may take something away
 * from it, so a caller handing this a negative number moves nothing rather than
 * quietly billing both partners. And the gain is queued for the server as well
 * as written locally, because the pet was only ever shared in name — see the
 * banner at the end of this file.
 */
export async function addXp(coupleId: string, amount: number): Promise<void> {
  await awardPetXp(coupleId, id(), amount);
}
/* ---- shared pet xp ---- */

/**
 * The couple's pet was never actually shared.
 *
 * `db.pet` is not one of the sync client's KINDS, and the D1 `pets` row is
 * written once at pairing, with defaults, and read by nothing. So each phone's
 * bar showed that phone's own contributions under a heading that said "ours".
 *
 * The fix cannot be another last-write-wins row. XP is additive: two phones
 * each adding to it and pushing the result would silently discard one person's
 * gains, which is exactly the argument that put boss HP on the server. So an
 * award is queued here, flushed by `pwa/petSync.ts`, and summed by
 * `functions/api/pet.ts` under `xp = xp + ?`.
 *
 * Everything below is gain-only. Nothing here subtracts from the pet, and
 * nothing could without first teaching `awardPetXp` to accept a negative
 * number.
 */

/**
 * How many award ids a phone remembers. Long enough that a victory reported
 * twice over is recognised, short enough that the row stays small.
 */
export const PET_XP_AWARD_MEMORY = 32;

/**
 * One gain, counted once.
 *
 * The id is the whole point: an award that arrives again — a boss victory both
 * phones report, a retried flush — lands on the same id and is ignored, here
 * and on the server. The amount is clamped upward, so the pet has no path down.
 */
/**
 * Fold a phone's pre-feature XP into the shared total, once.
 *
 * Before the pet was shared, each phone's `pet.xp` was purely its own owner's
 * gains — the row was never synced, so nothing of the partner's was ever in it.
 * Summing the two is therefore exactly the couple's history, not a double count.
 *
 * The awards are queued without touching `xp`, because that total is already
 * sitting in it. They are chunked to the endpoint's per-award ceiling, since a
 * couple who have been using this for months will be well past it.
 *
 * Recognising a pre-feature row is the whole trick: it has XP, has never settled
 * with the server, and has no award history. A row that has flushed even once
 * fails that test and is left alone.
 */
export async function seedLegacyPetXp(coupleId: string, memberId: MemberId): Promise<number> {
  return db.transaction('rw', db.pet, async () => {
    const pet = await db.pet.get(coupleId);
    if (!pet || pet.xp <= 0) return 0;
    if (pet.sharedXp !== undefined) return 0;
    if ((pet.awardedXpIds ?? []).length > 0) return 0;
    if ((pet.pendingXp ?? []).length > 0) return 0;

    const at = now();
    const awards: PetXpAward[] = [];
    let left = Math.floor(pet.xp);
    for (let part = 0; left > 0; part += 1) {
      const amount = Math.min(left, MAX_AWARD_XP);
      awards.push({ id: `seed-${memberId}-${part}`, amount, awardedAt: at });
      left -= amount;
    }

    await db.pet.put({
      ...pet,
      // `xp` deliberately unchanged: these are not new gains, they are the ones
      // already on the bar, told to the server for the first time.
      pendingXp: awards,
      sharedXp: 0,
      awardedXpIds: awards.map((a) => a.id).slice(-PET_XP_AWARD_MEMORY),
    });
    return awards.length;
  });
}

export async function awardPetXp(
  coupleId: string,
  awardId: string,
  amount: number,
): Promise<void> {
  // Not finite is not a gain. A NaN reaching the row would poison `xp` for
  // good — every later comparison against it is false, so the bar would never
  // move again — and the queued award would be refused by the endpoint on
  // every flush from then on.
  const gain = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;

  // Read and write in one transaction: a flush settling at the same moment
  // does the same read-modify-write on this row, and outside a transaction the
  // later `put` would carry the earlier one's `pendingXp` and drop this award.
  await db.transaction('rw', db.pet, async () => {
    const pet = await db.pet.get(coupleId);
    const counted = pet?.awardedXpIds ?? [];
    if (counted.includes(awardId)) return;

    await db.pet.put({
      coupleId,
      level: pet?.level ?? 1,
      // The bar moves now rather than when the network comes back: the award is
      // already on the queue, and a flush only ever raises this further.
      xp: (pet?.xp ?? 0) + gain,
      mood: pet?.mood ?? 'content',
      fedAt: pet?.fedAt ?? now(),
      pendingXp: [...(pet?.pendingXp ?? []), { id: awardId, amount: gain, awardedAt: now() }],
      sharedXp: pet?.sharedXp ?? 0,
      awardedXpIds: [...counted, awardId].slice(-PET_XP_AWARD_MEMORY),
    });
  });
}

/**
 * What clearing a tier is worth to the pet.
 *
 * Scaled by the same `tierScale` the fight itself uses, so the reward tracks
 * the fight without a second table of boss numbers to keep in step with
 * `worker/src/boss.ts`. The base is a little over a level from cold.
 */
export const BOSS_VICTORY_XP = 120;

export function bossVictoryXp(tier: number): number {
  // Capped at what one award may carry. The curve passes the endpoint's ceiling
  // around tier 18, and an award over it is refused on its merits — so without
  // this the reward for the hardest fight in the game is the only one that
  // never arrives.
  return Math.min(MAX_AWARD_XP, Math.round(BOSS_VICTORY_XP * tierScale(tier)));
}

/**
 * A cleared tier, paid to the shared pet.
 *
 * The id is the fight, not the phone: both partners were in it, both phones see
 * the victory, and both will report it. `boss-<tier>` makes those two reports
 * one award — and a tier is cleared once, since only a victory advances the
 * tier and a defeat re-runs it.
 */
export async function awardBossVictory(coupleId: string, tier: number): Promise<void> {
  const cleared = Math.max(1, Math.floor(tier));
  await awardPetXp(coupleId, `boss-${cleared}`, bossVictoryXp(cleared));
}

export interface PetXpNumbers {
  xp: number;
  sharedXp: number;
  pendingXp: PetXpAward[];
}

/**
 * Fold a flush's answer back into the local row.
 *
 * The numbers are decided by `mergePetXp` in `pwa/petSync.ts`, which is where
 * the rule that none of them may fall is written down and tested. It is handed
 * in as a function rather than as numbers on purpose: a round trip takes long
 * enough for a task to be ticked off mid-flight, and merging against the row
 * read before the request would write that award's XP back out of existence —
 * and its id is already in `awardedXpIds`, so nothing would ever re-add it.
 * Reading, merging and writing inside one transaction is what makes the answer
 * apply to the row as it is now.
 */
export async function settlePetXp(
  coupleId: string,
  merge: (pet: Pet | undefined) => PetXpNumbers,
): Promise<PetXpNumbers> {
  return db.transaction('rw', db.pet, async () => {
    const pet = await db.pet.get(coupleId);
    const next = merge(pet);
    await db.pet.put({
      coupleId,
      level: pet?.level ?? 1,
      mood: pet?.mood ?? 'content',
      fedAt: pet?.fedAt ?? now(),
      awardedXpIds: pet?.awardedXpIds ?? [],
      ...next,
    });
    return next;
  });
}
