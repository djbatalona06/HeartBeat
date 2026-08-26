import type { CoupleId, MemberId } from '../types';
import type { Rarity } from './gear';
import { RARITIES } from './gear';
import type { SkillEffect } from './skills';

/**
 * Sixteen pets: four species at four rarities. Each hatches with a short lore
 * briefing that is revealed **only on hatch** — an egg tells you nothing, which
 * is the whole of why an egg is worth having.
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
    id: 'horse-godly', species: 'horse', rarity: 'godly', name: 'Comet-Maned', baseMp: 22,
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
    id: 'fairy-godly', species: 'fairy', rarity: 'godly', name: 'Aurora Fairy', baseMp: 24,
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
    id: 'vampire-godly', species: 'vampire', rarity: 'godly', name: 'Eclipse Vampire', baseMp: 24,
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
    id: 'cat-godly', species: 'cat', rarity: 'godly', name: 'Lantern-Tail Cat', baseMp: 23,
    lore: 'Walks ahead on the dark part of the road and does not look back to check.',
    skill: { id: 'walks-ahead', name: 'Walks Ahead', mpCost: 15, minRank: 4,
      blurb: 'Certain that you are following, which turns out to be the help.',
      effect: { damage: 2.4, shield: 22, heal: 14 } },
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
  common: 0.62,
  rare: 0.25,
  epic: 0.1,
  godly: 0.03,
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
    common: Math.max(0, 1 - rest),
    rare: raised.rare,
    epic: raised.epic,
    godly: raised.godly,
  };
}

/** `roll` is a number in [0, 1). Passed in so the caller owns the randomness. */
export function rollRarity(roll: number, luck: number, bonus = 0): Rarity {
  const chances = dropChances(luck, bonus);
  // Rarest first, so the tail is what a high roll reaches.
  let ceiling = 0;
  for (const rarity of ['godly', 'epic', 'rare'] as Rarity[]) {
    ceiling += chances[rarity];
    if (roll < ceiling) return rarity;
  }
  return 'common';
}

/** Which of the four species, given a second independent roll. */
export function rollKind(rarityRoll: number, speciesRoll: number, luck: number, bonus = 0): PetKind {
  const pool = petKindsOfRarity(rollRarity(rarityRoll, luck, bonus));
  const index = Math.min(pool.length - 1, Math.floor(Math.max(0, speciesRoll) * pool.length));
  return pool[index];
}
