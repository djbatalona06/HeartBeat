/**
 * The rarity ladder, and what a rung is worth.
 *
 * Five tiers now rather than four. The fifth is **mythic**, above what used to
 * be the ceiling, and the old top rung is renamed *legendary* to sit under it —
 * "godly" left no room for anything above it, which is the whole problem with
 * naming a ceiling after a god.
 *
 * ## The rename, and the ids that survived it
 *
 * `'godly'` is gone as a token and `'legendary'` stands in its place. Nothing
 * stored anywhere carries a tier: gear and pets are looked up in a catalogue by
 * id and the tier is read off the entry, so renaming the token orphans nothing.
 * The **ids** are a different matter and are deliberately untouched —
 * `horse-godly` is a legendary pet now, and renaming it would orphan a real
 * companion in a real couple's `pets` table. That is the same ruling `gear.ts`
 * already made for `head-paper-crown`, which is a helmet whose id says head.
 *
 * `normalizeTier` exists for the one case the ruling does not cover: a token
 * that reached a device before the rename — a cached API payload, a hand-edited
 * row — should read as legendary rather than as nothing.
 *
 * ## What a tier is worth
 *
 * Two numbers, and they are the whole contract every item in the app is held
 * to:
 *
 * - **Stat level** — the item's own contribution to its stat category.
 * - **Passive** — an always-on percentage buff. Common has none; that is the
 *   only rung that does not, and it is what makes a common item a common item.
 *
 * Nothing in this app is purely cosmetic. A dye, a cushion, a companion — each
 * one lands somewhere on this ladder and carries the ladder's numbers with it.
 * `raidStats.ts` is where they are added up.
 */

export type Tier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

/** Ascending, and the order everything else sorts and compares by. */
export const TIERS: readonly Tier[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

export const TIER_NAMES: Record<Tier, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
};

/** The token this ladder used to end on, kept only so old data still reads. */
export const LEGACY_TIER = 'godly';

/**
 * A stored or fetched tier token, as a `Tier`. Unknown tokens fall to common
 * rather than throwing: a holding that arrives with a tier nobody recognises
 * should still be ownable, just unremarkable.
 */
export function normalizeTier(value: string | undefined | null): Tier {
  if (value === LEGACY_TIER) return 'legendary';
  return (TIERS as readonly string[]).includes(value ?? '') ? (value as Tier) : 'common';
}

export function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier);
}

/** Ascending, for `sort`. */
export function compareTiers(a: Tier, b: Tier): number {
  return tierRank(a) - tierRank(b);
}

/** Every tier at or above `floor`, ascending. The shape a pity floor needs. */
export function tiersAtOrAbove(floor: Tier): Tier[] {
  return TIERS.filter((tier) => tierRank(tier) >= tierRank(floor));
}

/* -- the table --------------------------------------------------------------- */

export interface Band {
  /** Inclusive. */
  min: number;
  /** Inclusive. */
  max: number;
}

/**
 * Stat level by tier.
 *
 * The bands touch at 10, 20 and 30 rather than butting up against each other,
 * and that is the table as written rather than an off-by-one. A rare item at
 * the very top of its band is worth exactly what an epic at the bottom of its
 * is worth — which is the right answer, because the epic is carrying a passive
 * the rare is not, and *that* is what it is paying for.
 */
export const TIER_STAT_LEVELS: Record<Tier, Band> = {
  common: { min: 1, max: 3 },
  rare: { min: 4, max: 10 },
  epic: { min: 10, max: 20 },
  legendary: { min: 20, max: 30 },
  mythic: { min: 30, max: 50 },
};

/**
 * The always-on buff, as a percentage.
 *
 * Common is the one flat zero, and deliberately: a ladder where every rung
 * carries a passive has no bottom rung, only a worse top one.
 */
export const TIER_PASSIVES: Record<Tier, Band> = {
  common: { min: 0, max: 0 },
  rare: { min: 1, max: 2.5 },
  epic: { min: 2.6, max: 5 },
  legendary: { min: 5.1, max: 7.5 },
  mythic: { min: 7.6, max: 10 },
};

/** Where in its band a roll in [0, 1) lands. Deterministic; the caller owns
 *  the randomness, exactly as `rollRarity` does in `pets.ts`. */
export function statLevelFor(tier: Tier, roll: number): number {
  const band = TIER_STAT_LEVELS[tier];
  const clamped = Math.min(0.999999, Math.max(0, roll));
  return band.min + Math.floor(clamped * (band.max - band.min + 1));
}

/** How far through its own band a stat level sits, in [0, 1]. */
export function bandPosition(tier: Tier, statLevel: number): number {
  const band = TIER_STAT_LEVELS[tier];
  const span = band.max - band.min;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (statLevel - band.min) / span));
}

/**
 * The passive a given item carries, as a percentage.
 *
 * Read off its position in its own stat band, so the best common-or-better item
 * in a tier is also the one with the strongest passive and there is never a
 * pair where one number says take this and the other says take that.
 */
export function passiveFor(tier: Tier, statLevel: number): number {
  const band = TIER_PASSIVES[tier];
  if (band.max <= band.min) return band.min;
  const lifted = band.min + bandPosition(tier, statLevel) * (band.max - band.min);
  // One decimal, because the table is written to one decimal and a screen
  // showing 2.5999999999999996% is a screen nobody trusts.
  return Math.round(lifted * 10) / 10;
}

/* -- stacking ---------------------------------------------------------------- */

/**
 * Each further passive counts for less than the last.
 *
 * Without this, seven mythic passives is a flat +70% and the only correct move
 * in the game is to own seven mythic things — which is not a decision, it is a
 * shopping list. At 0.7 the second copy of a buff is worth 70% of the first,
 * the third 49%, and the eighth is rounding error, so a second Fortify item is
 * worth having and a fifth is worth trading away for something else.
 */
export const STACK_FALLOFF = 0.7;

/**
 * And a ceiling on top of the falloff. A full mythic set lands just under 31%
 * before the cap, so the cap is doing real work rather than being decorative —
 * it is what stops a finished couple from being able to ignore the fight.
 */
export const STACK_CAP = 0.3;

/**
 * Percentages in, a single multiplier-minus-one out, as a fraction.
 *
 * Sorted descending first, so the answer does not depend on what order a
 * couple happened to equip things in. That is not a nicety: unsorted, the same
 * seven items would be worth different amounts on two phones, and the two would
 * disagree about how hard a boss hit.
 */
export function stackPassives(percents: readonly number[]): number {
  const sorted = [...percents].filter((p) => p > 0).sort((a, b) => b - a);
  let total = 0;
  sorted.forEach((percent, index) => {
    total += (percent / 100) * STACK_FALLOFF ** index;
  });
  return Math.min(STACK_CAP, total);
}
