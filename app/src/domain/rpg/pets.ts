import type { CoupleId, MemberId } from '../types';
import type { Rarity } from './gear';
import { RARITIES } from './gear';
import { tierRank, tiersAtOrAbove } from './tiers';
import type { SkillEffect } from './skills';

/**
 * Twenty pets: four species at five tiers. Each hatches with a short lore
 * briefing that is revealed **only on hatch** — an egg tells you nothing, which
 * is the whole of why an egg is worth having.
 *
 * The four ids ending `-godly` are legendary companions. The tier was renamed
 * when mythic was added above it (`tiers.ts`); the ids were not, because a
 * couple's stored `pets` row names its companion by id and renaming one would
 * lose them a pet they had hatched. A pet is not a row to be tidied.
 *
 * A pet carries its own MP bar, separate from yours and grown by rank rather
 * than by level, and spends it on a skill only it has. That is what makes the
 * choice of companion matter in a boss fight when the stats are otherwise flat.
 */

export type PetSpecies = 'horse' | 'fairy' | 'vampire' | 'cat';

export const SPECIES_NAMES: Record<PetSpecies, string> = {
  horse: 'Horse',
  fairy: 'Fairy',
  vampire: 'Vampire',
  cat: 'Ribbon Cat',
};

export interface PetSkill {
  id: string;
  name: string;
  blurb: string;
  mpCost: number;
  /** Gated by the pet's rank, not by your level. The pet earns its own. */
  minRank: number;
  effect: SkillEffect;
}

export interface PetKind {
  id: string;
  species: PetSpecies;
  rarity: Rarity;
  name: string;
  /** Revealed on hatch and never before. */
  lore: string;
  /** MP ceiling at rank 1, before rank progression adds to it. */
  baseMp: number;
  skill: PetSkill;
}

/**
 * The cat is drawn from the original hand-drawn cat mark already in this
 * repository — ellipses, a bow, and two line-segment whiskers — and is named
 * descriptively for it. No collectible here is any rights holder's character;
 * see NOTICE.md.
 */
export const PET_KINDS: PetKind[] = [
  // Horse ---------------------------------------------------------------------
  {
    id: 'horse-common', species: 'horse', rarity: 'common', name: 'Field Horse', baseMp: 8,
    lore: 'Pulled a cart for eleven years and has opinions about hills.',
    skill: { id: 'steady-pull', name: 'Steady Pull', mpCost: 4, minRank: 1,
      blurb: 'Not fast. Simply does not stop.', effect: { damage: 1.2 } },
  },
  {
    id: 'horse-rare', species: 'horse', rarity: 'rare', name: 'Dawn Courser', baseMp: 12,
    lore: 'Runs the hour before sunrise and is asleep by nine.',
    skill: { id: 'first-light', name: 'First Light', mpCost: 6, minRank: 2,
      blurb: 'Arrives before the day has decided what it is.', effect: { damage: 1.5, energy: 3 } },
  },
  {
    id: 'horse-epic', species: 'horse', rarity: 'epic', name: 'Tidewalker', baseMp: 16,
    lore: 'Crossed an estuary at the exact minute the water allowed it, and knew.',
    skill: { id: 'turning-tide', name: 'Turning Tide', mpCost: 9, minRank: 3,
      blurb: 'The moment a long thing starts going the other way.', effect: { damage: 2, shield: 12 } },
  },
  {
    id: 'horse-godly', species: 'horse', rarity: 'legendary', name: 'Comet-Maned', baseMp: 22,
    lore: 'Seen twice in one lifetime, which is once more than is usual.',
    skill: { id: 'long-return', name: 'Long Return', mpCost: 14, minRank: 4,
      blurb: 'Gone for years. Comes back on the day it said it would.',
      effect: { damage: 2.8, heal: 20 } },
  },

  // Fairy ---------------------------------------------------------------------
  {
    id: 'fairy-common', species: 'fairy', rarity: 'common', name: 'Lantern Fairy', baseMp: 9,
    lore: 'Lives in the porch light and is the reason it flickers.',
    skill: { id: 'porch-light', name: 'Porch Light', mpCost: 4, minRank: 1,
      blurb: 'Left on for somebody who is still out.', effect: { shield: 10 } },
  },
  {
    id: 'fairy-rare', species: 'fairy', rarity: 'rare', name: 'Lily Fairy', baseMp: 13,
    lore: 'Sleeps folded inside a flower that only opens for a few hours.',
    skill: { id: 'petal-hour', name: 'Petal Hour', mpCost: 7, minRank: 2,
      blurb: 'A short window, used properly.', effect: { heal: 16 } },
  },
  {
    id: 'fairy-epic', species: 'fairy', rarity: 'epic', name: 'Stargazer Fairy', baseMp: 17,
    lore: 'Has counted them. Will not tell you the number, only that it is wrong.',
    skill: { id: 'wider-sky', name: 'Wider Sky', mpCost: 10, minRank: 3,
      blurb: 'Makes the thing in front of you the correct size again.',
      effect: { shield: 24, heal: 10 } },
  },
  {
    id: 'fairy-godly', species: 'fairy', rarity: 'legendary', name: 'Aurora Fairy', baseMp: 24,
    lore: 'Only ever appears when two people are already looking up together.',
    skill: { id: 'both-looking-up', name: 'Both Looking Up', mpCost: 15, minRank: 4,
      blurb: 'The rare thing, and the witness to it.', effect: { heal: 34, shield: 20 } },
  },

  // Vampire -------------------------------------------------------------------
  {
    id: 'vampire-common', species: 'vampire', rarity: 'common', name: 'Candle Vampire', baseMp: 9,
    lore: 'Afraid of the sun in principle. Mostly afraid of mornings.',
    skill: { id: 'night-shift', name: 'Night Shift', mpCost: 5, minRank: 1,
      blurb: 'Awake anyway, so it may as well be useful.', effect: { damage: 1.3 } },
  },
  {
    id: 'vampire-rare', species: 'vampire', rarity: 'rare', name: 'Velvet Vampire', baseMp: 13,
    lore: 'Owns one good coat and has never needed a second.',
    skill: { id: 'one-good-coat', name: 'One Good Coat', mpCost: 7, minRank: 2,
      blurb: 'Enough, kept well, for a very long time.', effect: { damage: 1.6, shield: 10 } },
  },
  {
    id: 'vampire-epic', species: 'vampire', rarity: 'epic', name: 'Moonless Vampire', baseMp: 18,
    lore: 'Prefers the nights nobody photographs.',
    skill: { id: 'unlit-hour', name: 'Unlit Hour', mpCost: 10, minRank: 3,
      blurb: 'Work done where there is no credit for it.', effect: { damage: 2.2 } },
  },
  {
    id: 'vampire-godly', species: 'vampire', rarity: 'legendary', name: 'Eclipse Vampire', baseMp: 24,
    lore: 'Waited four hundred years for four minutes and says it was worth it.',
    skill: { id: 'four-minutes', name: 'Four Minutes', mpCost: 16, minRank: 4,
      blurb: 'Everything, spent at once, on purpose.', effect: { damage: 3.2 } },
  },

  // Ribbon Cat ----------------------------------------------------------------
  {
    id: 'cat-common', species: 'cat', rarity: 'common', name: 'Paper Cat', baseMp: 8,
    lore: 'Drawn in six lines on the back of an envelope and refused to stay there.',
    skill: { id: 'six-lines', name: 'Six Lines', mpCost: 4, minRank: 1,
      blurb: 'The whole of something, in almost nothing.', effect: { damage: 1.25 } },
  },
  {
    id: 'cat-rare', species: 'cat', rarity: 'rare', name: 'Ribbon Cat', baseMp: 12,
    lore: 'Wears the bow on the left. Has been asked about it and did not answer.',
    skill: { id: 'tied-on-the-left', name: 'Tied on the Left', mpCost: 6, minRank: 2,
      blurb: 'A small fixed thing, in a week of moving ones.',
      effect: { shield: 14, heal: 6 } },
  },
  {
    id: 'cat-epic', species: 'cat', rarity: 'epic', name: 'Ink Cat', baseMp: 17,
    lore: 'Sat on the letter while it was being written and is in it now.',
    skill: { id: 'still-wet', name: 'Still Wet', mpCost: 9, minRank: 3,
      blurb: 'Gets on everything. Nobody minds.', effect: { damage: 1.9, heal: 12 } },
  },
  {
    id: 'cat-godly', species: 'cat', rarity: 'legendary', name: 'Lantern-Tail Cat', baseMp: 23,
    lore: 'Walks ahead on the dark part of the road and does not look back to check.',
    skill: { id: 'walks-ahead', name: 'Walks Ahead', mpCost: 15, minRank: 4,
      blurb: 'Certain that you are following, which turns out to be the help.',
      effect: { damage: 2.4, shield: 22, heal: 14 } },
  },

  // Mythic --------------------------------------------------------------------
  // One per species, at the rung above legendary. Each one is the quietest
  // member of its species rather than the loudest, which is the whole joke and
  // also the design: the strongest thing in this app is never the biggest.
  {
    id: 'horse-mythic', species: 'horse', rarity: 'mythic', name: 'The Old Grey', baseMp: 30,
    lore: 'Has carried both of you, separately, years before you met. Says nothing about it.',
    skill: { id: 'carried-you-both', name: 'Carried You Both', mpCost: 18, minRank: 5,
      blurb: 'Was there for the parts the other one did not see.',
      effect: { damage: 3.4, heal: 26, shield: 18 } },
  },
  {
    id: 'fairy-mythic', species: 'fairy', rarity: 'mythic', name: 'Hearthlight Fairy', baseMp: 32,
    lore: 'Lives in the pilot light, and is the reason the house is warm in the morning.',
    skill: { id: 'still-lit', name: 'Still Lit', mpCost: 19, minRank: 5,
      blurb: 'Small, constant, and the whole of why nothing froze.',
      effect: { heal: 44, shield: 30, energy: 6 } },
  },
  {
    id: 'vampire-mythic', species: 'vampire', rarity: 'mythic', name: 'The Long Patient', baseMp: 31,
    lore: 'Outlived everyone it was afraid of. Did it by waiting, which nobody believes.',
    skill: { id: 'outlasted', name: 'Outlasted', mpCost: 20, minRank: 5,
      blurb: 'Not stronger. Simply still here when the other thing was not.',
      effect: { damage: 4, shield: 16 } },
  },
  {
    id: 'cat-mythic', species: 'cat', rarity: 'mythic', name: 'Hearth Cat', baseMp: 30,
    lore: 'Chose the house. Nobody chose it, and it has never once been asked to leave.',
    skill: { id: 'chose-the-house', name: 'Chose the House', mpCost: 18, minRank: 5,
      blurb: 'Arrived, stayed, and made the place a home by doing only that.',
      effect: { damage: 2.8, heal: 30, shield: 26 } },
  },
];

const BY_ID = new Map(PET_KINDS.map((p) => [p.id, p]));

export function petKindById(id: string): PetKind | undefined {
  return BY_ID.get(id);
}

export function petKindsOfRarity(rarity: Rarity): PetKind[] {
  return PET_KINDS.filter((p) => p.rarity === rarity);
}

/**
 * A hatched pet. Rank is derived from bond for the same reason level is derived
 * from XP: a stored rank is a second copy that can disagree with the bond it
 * came from, and the copy is always the one on screen.
 */
export interface PetInstance {
  id: string;
  coupleId: CoupleId;
  memberId: MemberId;
  kindId: string;
  /** Raised by adventures and by fighting alongside you. Never falls. */
  bond: number;
  /** The pet's own pool, spent on its own skill. */
  mp: number;
  hatchedAt: number;
  /** Set the moment the lore is shown, so it is a reveal and not a label. */
  loreSeenAt?: number;
  updatedAt: number;
}

/** Cumulative bond for ranks 1 through 5. */
export const PET_RANK_BONDS = [0, 20, 60, 140, 300];
export const MAX_PET_RANK = PET_RANK_BONDS.length;
export const MP_PER_RANK = 3;

export function rankOf(bond: number): number {
  let rank = 1;
  for (let i = 1; i < PET_RANK_BONDS.length; i += 1) {
    if (bond >= PET_RANK_BONDS[i]) rank = i + 1;
  }
  return rank;
}

export function bondForRank(rank: number): number {
  return PET_RANK_BONDS[Math.max(0, Math.min(MAX_PET_RANK, rank) - 1)];
}

export function maxPetMp(kind: PetKind, rank: number): number {
  return kind.baseMp + (Math.max(1, rank) - 1) * MP_PER_RANK;
}

export interface PetSheet {
  kind: PetKind;
  rank: number;
  bond: number;
  /** Bond still needed for the next rank, or null at the ceiling. */
  toNextRank: number | null;
  mp: number;
  maxMp: number;
  skillReady: boolean;
  skillBlockedBecause: string | null;
}

export function petSheet(pet: PetInstance): PetSheet {
  const kind = petKindById(pet.kindId);
  if (!kind) throw new Error(`unknown pet kind: ${pet.kindId}`);
  const rank = rankOf(pet.bond);
  const ceiling = maxPetMp(kind, rank);
  const mp = Math.min(pet.mp, ceiling);
  const nextBond = rank < MAX_PET_RANK ? PET_RANK_BONDS[rank] : null;

  let blocked: string | null = null;
  if (rank < kind.skill.minRank) blocked = `${kind.skill.name} unlocks at rank ${kind.skill.minRank}.`;
  else if (mp < kind.skill.mpCost) blocked = `${kind.name} needs ${kind.skill.mpCost} MP.`;

  return {
    kind,
    rank,
    bond: pet.bond,
    toNextRank: nextBond === null ? null : Math.max(0, nextBond - pet.bond),
    mp,
    maxMp: ceiling,
    skillReady: blocked === null,
    skillBlockedBecause: blocked,
  };
}

/* -- drops ------------------------------------------------------------------ */

/** The rate before luck or a victory touches it. */
export const BASE_DROP_CHANCES: Record<Rarity, number> = {
  common: 0.612,
  rare: 0.25,
  epic: 0.1,
  legendary: 0.03,
  mythic: 0.008,
};

export const LUCK_PER_POINT = 0.01;
export const MAX_LUCK_LIFT = 0.45;

/**
 * Luck nudges rarity and nothing else. It deliberately never touches a payout:
 * a stat that quietly multiplied XP would make gear a build again, and the
 * no-classes rule exists to stop exactly that.
 *
 * `bonus` is the post-victory lift from `boss.ts` — each non-common rarity's
 * chance is multiplied by `1 + bonus`, and common absorbs the remainder, so a
 * 0.25 bonus is precisely a 25% better chance at every rarity above common.
 */
export function dropChances(luck: number, bonus = 0): Record<Rarity, number> {
  const lift = (1 + Math.min(MAX_LUCK_LIFT, Math.max(0, luck) * LUCK_PER_POINT))
    * (1 + Math.max(0, bonus));

  const raised: Record<string, number> = {};
  let rest = 0;
  for (const rarity of RARITIES) {
    if (rarity === 'common') continue;
    raised[rarity] = BASE_DROP_CHANCES[rarity] * lift;
    rest += raised[rarity];
  }

  // Absurd luck could otherwise push the tail past certainty; when it does,
  // common simply falls away and the rest keep their proportions.
  if (rest >= 1) {
    for (const rarity of RARITIES) if (rarity !== 'common') raised[rarity] /= rest;
    rest = 1;
  }

  return {
    ...(raised as Record<Rarity, number>),
    common: Math.max(0, 1 - rest),
  };
}

/* ---- pity ------------------------------------------------------------------
 * Insurance against a bad run, and nothing else.
 */

/**
 * Eggs without an epic or better before one is guaranteed.
 *
 * Fifteen, and the number is chosen to do one job. The base chance of epic or
 * better is 13.8%, so the expected wait is about seven eggs and the chance of
 * going fifteen without is `0.862^15`, a little under one run in ten. So this
 * **removes the bad tail without moving the median** — which is the whole
 * honest purpose of a pity system, and the only version of it worth having.
 *
 * A hard floor on *mythic* instead would need a counter in the hundreds to mean
 * anything at 0.8%, and at 120 coins an egg that is years away. A promise
 * nobody lives to collect is not a promise.
 *
 * What this deliberately is not: a countdown, a second currency, or something
 * that can be bought down. Nothing anywhere tells a couple their pity is about
 * to do anything, because the point is that a bad run stops quietly, not that
 * there is a new number to feel anxious about.
 *
 * `chests.ts` runs three more counters of exactly this shape, one per chest,
 * and imports `applyFloor` below rather than writing the rescale a second time.
 */
export const PITY_AT = 15;

/** What an egg's pity is a floor on. */
export const PITY_TIER: Rarity = 'epic';

/** The floor in force at this count, or null when there is none. */
export function pityFloor(pity: number): Rarity | null {
  return pity >= PITY_AT ? PITY_TIER : null;
}

/**
 * A chance table with everything below `floor` removed and the rest rescaled
 * against each other.
 *
 * The rescale is what makes a floor honest: it keeps the surviving tiers'
 * **relative** weights exactly as they were, so pity never decides *which* of
 * the good outcomes you get — it only rules out the bad ones. A floor that
 * flattened the tail instead would be quietly handing out mythics.
 *
 * Exported because the chests need the identical operation on their own pools,
 * and two copies of a rescale is two chances to get a divide-by-zero wrong.
 */
export function applyFloor(
  chances: Record<Rarity, number>,
  floor: Rarity,
): Record<Rarity, number> {
  const kept = tiersAtOrAbove(floor);
  const tail = kept.reduce((sum, tier) => sum + (chances[tier] ?? 0), 0);

  const out = Object.fromEntries(RARITIES.map((tier) => [tier, 0])) as Record<Rarity, number>;
  // The tail can only reach zero through absurd inputs, and a divide by zero
  // would poison every later comparison rather than throwing. The floor itself
  // is the safe answer: it is the thing that was promised.
  if (tail <= 0) {
    out[floor] = 1;
    return out;
  }
  for (const tier of kept) out[tier] = (chances[tier] ?? 0) / tail;
  return out;
}

/**
 * The odds of the **next** egg, which is the only table worth showing anyone.
 *
 * `dropChances` answers "what are the odds in general". This answers "what are
 * the odds for the pull this couple is about to make", and the difference is
 * the whole reason publishing them is defensible: a pity system silently lifts
 * the real rate above the printed one, so a screen showing a flat 10% next to a
 * guarantee it does not mention is telling a small lie every fifteenth egg.
 *
 * At the floor, common and rare fall to zero and the three tiers above them are
 * rescaled against each other — see `applyFloor`.
 */
export function chancesFor(luck: number, bonus = 0, pity = 0): Record<Rarity, number> {
  const base = dropChances(luck, bonus);
  const floor = pityFloor(pity);
  return floor ? applyFloor(base, floor) : base;
}

/**
 * The counter after a hatch: cleared by an epic or better, and otherwise one
 * higher. Pure, so the repository has no arithmetic of its own to get wrong.
 */
export function nextPity(pity: number, got: Rarity): number {
  if (tierRank(got) >= tierRank(PITY_TIER)) return 0;
  return Math.max(0, pity) + 1;
}

/**
 * `roll` is a number in [0, 1). Passed in so the caller owns the randomness.
 *
 * Reads `chancesFor` rather than `dropChances`, which is what makes the floor
 * apply without a branch here: at the floor the two bottom rarities are simply
 * zero-width and unreachable.
 */
export function rollRarity(roll: number, luck: number, bonus = 0, pity = 0): Rarity {
  const chances = chancesFor(luck, bonus, pity);
  // Rarest first, so the tail is what a high roll reaches. Walked off
  // `RARITIES` rather than a written-out list, so a sixth rung would need no
  // edit here — the list and the ladder cannot fall out of step.
  let ceiling = 0;
  for (let i = RARITIES.length - 1; i > 0; i -= 1) {
    ceiling += chances[RARITIES[i]];
    if (roll < ceiling) return RARITIES[i];
  }
  return 'common';
}

/** Which of the four species, given a second independent roll. */
export function rollKind(
  rarityRoll: number,
  speciesRoll: number,
  luck: number,
  bonus = 0,
  pity = 0,
): PetKind {
  const pool = petKindsOfRarity(rollRarity(rarityRoll, luck, bonus, pity));
  const index = Math.min(pool.length - 1, Math.floor(Math.max(0, speciesRoll) * pool.length));
  return pool[index];
}
