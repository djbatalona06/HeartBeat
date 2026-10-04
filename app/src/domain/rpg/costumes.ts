import type { Tier } from './tiers';

/**
 * Costumes for the birb: things it wears, as opposed to the colour it is.
 *
 * A **dye** (`dyes.ts`) recolours the animal through three custom properties the
 * five mascots paint in. A **costume** is a drawing laid over it, and it paints
 * in two colours of its own — `--costume-main` and `--costume-trim` — that no dye
 * touches. That separation is the point: wearing a wizard hat never changes
 * what colour your bird is, and dyeing your bird never repaints the hat. The
 * art tests read the drawings to hold the second half of that.
 *
 * Purely cosmetic. A costume has no stat and stays out of the loadout, so
 * nothing here is ever the reason a fight is won.
 *
 * ## Costumes come out of eggs, at the companion's own rung
 *
 * They are not sold. Every egg hatched brings one costume of the **same tier as
 * the companion that hatched** — a common hatch a common costume, a mythic hatch
 * a mythic one — so the rarest things to wear come with the rarest companions
 * and the tier means the same thing on both. A repeat refunds a few coins
 * (`COSTUME_REFUND`) rather than nothing; see `buyEgg`.
 *
 * One row each in the shared inventory table under its own prefix, worn through
 * `Avatar.costume`.
 */

export const COSTUME_PREFIX = 'costume-';

/**
 * Where on the bird a garment sits, which is what decides how it is fitted to
 * each of the five mascots -- see `costumeFit.ts`.
 */
export type CostumeSlot = 'head' | 'neck' | 'back';

export interface Costume {
  id: string;
  slot: CostumeSlot;
  name: string;
  blurb: string;
  /** Which hatches it can come out of: the companion's tier, exactly. */
  tier: Tier;
  /** The garment's body colour. A mid-tone: the packs run near-black to near-white. */
  main: string;
  /** Its edging and small details. */
  trim: string;
}

/**
 * Fifteen: four, four, three, two, two up the ladder, so the commons are the
 * everyday and the top is something you happened to be given.
 */
export const COSTUMES: readonly Costume[] = [
  // Common --------------------------------------------------------------------
  { id: 'costume-bow-tie', slot: 'neck', name: 'Bow tie', tier: 'common', blurb: 'For no occasion in particular.', main: '#2a7f9e', trim: '#f2cc6b' },
  { id: 'costume-party-cone', slot: 'head', name: 'Party cone', tier: 'common', blurb: 'Somebody, somewhere, is having a birthday.', main: '#e76f51', trim: '#f4d35e' },
  { id: 'costume-beanie', slot: 'head', name: 'Wool beanie', tier: 'common', blurb: 'Pulled down over the ears, against the wind and most opinions.', main: '#5b8fb9', trim: '#f2efe6' },
  { id: 'costume-bandana', slot: 'neck', name: 'Bandana', tier: 'common', blurb: 'Knotted at the back, in a hurry, and it held.', main: '#c8553d', trim: '#f6e9d7' },
  // Rare ----------------------------------------------------------------------
  { id: 'costume-flower-crown', slot: 'head', name: 'Flower crown', tier: 'rare', blurb: 'Picked this morning. Probably.', main: '#e8749a', trim: '#ffd95a' },
  { id: 'costume-scarf', slot: 'neck', name: 'Long scarf', tier: 'rare', blurb: 'Knitted slowly, by someone who cared.', main: '#d64550', trim: '#f6efe0' },
  { id: 'costume-straw-hat', slot: 'head', name: 'Straw hat', tier: 'rare', blurb: 'Sat on once, and better for it.', main: '#d9b25f', trim: '#c04b3c' },
  { id: 'costume-headphones', slot: 'head', name: 'Big headphones', tier: 'rare', blurb: 'Playing the one album, again, with feeling.', main: '#4b5d8a', trim: '#ff8fa3' },
  // Epic ----------------------------------------------------------------------
  { id: 'costume-wizard-hat', slot: 'head', name: 'Wizard hat', tier: 'epic', blurb: 'Wisdom not included.', main: '#6c5ce7', trim: '#ffd166' },
  { id: 'costume-cape', slot: 'back', name: 'Little cape', tier: 'epic', blurb: 'Fastened with something shiny.', main: '#8e44ad', trim: '#f4a261' },
  { id: 'costume-top-hat', slot: 'head', name: 'Top hat', tier: 'epic', blurb: 'Nothing comes out of it. It is simply very tall.', main: '#4a4458', trim: '#d94f6b' },
  // Legendary -----------------------------------------------------------------
  { id: 'costume-starlit-crown', slot: 'head', name: 'Starlit crown', tier: 'legendary', blurb: 'The stars it holds were all there before it was made.', main: '#e3b341', trim: '#7ed6ff' },
  { id: 'costume-phoenix-plume', slot: 'head', name: 'Phoenix plume', tier: 'legendary', blurb: 'Warm to stand near, and never quite the same twice.', main: '#ff7a3d', trim: '#ffd23f' },
  // Mythic --------------------------------------------------------------------
  { id: 'costume-eclipse-crown', slot: 'head', name: 'Eclipse crown', tier: 'mythic', blurb: 'The one afternoon everybody stopped and looked up together.', main: '#6a4bd6', trim: '#ffe9a8' },
  { id: 'costume-heartbound-wings', slot: 'back', name: 'Heartbound wings', tier: 'mythic', blurb: 'Not for flying. For being carried the last bit of the way.', main: '#f5a3c0', trim: '#fff0f5' },
];

export function costumeById(id: string | undefined): Costume | undefined {
  return id ? COSTUMES.find((costume) => costume.id === id) : undefined;
}

export function isCostumeItem(itemId: string): boolean {
  return itemId.startsWith(COSTUME_PREFIX);
}

export function costumesOfTier(tier: Tier): Costume[] {
  return COSTUMES.filter((costume) => costume.tier === tier);
}

/**
 * What a repeat costume refunds. Small, and well under an egg's price: the egg
 * still brought a companion, so this is only the costume's share, and an egg
 * can never pay for itself by repeating.
 */
export const COSTUME_REFUND: Record<Tier, number> = {
  common: 8,
  rare: 15,
  epic: 30,
  legendary: 60,
  mythic: 100,
};

/**
 * The costume a hatch of `tier` brings, from a roll in [0, 1).
 *
 * Prefers one the member does not have, so a refund is the last resort rather
 * than the common case — the same rule `pickPrizeId` follows for chests.
 * `duplicate` is true only when every costume at the tier is already owned.
 */
export function pickCostume(
  tier: Tier,
  roll: number,
  owned: ReadonlySet<string>,
): { costume: Costume; duplicate: boolean } {
  const all = costumesOfTier(tier);
  const fresh = all.filter((costume) => !owned.has(costume.id));
  const from = fresh.length > 0 ? fresh : all;
  const index = Math.min(from.length - 1, Math.floor(Math.min(0.999999, Math.max(0, roll)) * from.length));
  return { costume: from[index], duplicate: fresh.length === 0 };
}

/** The two custom properties a costume's drawing reads, as a style object. */
export function costumeStyle(id: string | undefined): Record<string, string> {
  const costume = costumeById(id);
  return costume ? { '--costume-main': costume.main, '--costume-trim': costume.trim } : {};
}
