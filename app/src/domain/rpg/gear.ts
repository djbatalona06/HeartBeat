import { GEAR_SLOTS, type GearSlot, type StatKey, type Stats } from './types';
import { addStats } from './avatar';

/**
 * Five slots, one item each. Gear is the only thing that breaks the
 * all-stats-rise-together rule, and it breaks it on purpose: levelling is
 * uniform so nobody can build themselves out of a boss, while gear is where a
 * choice lives. The choice is reversible in one tap, which is what keeps it a
 * choice rather than a build.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'godly';

export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'godly'];

export const RARITY_NAMES: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  godly: 'Godly',
};

/** What a slot is called on screen. The type's own members are lowercase. */
export const SLOT_NAMES: Record<GearSlot, string> = {
  helmet: 'Helmet',
  chestplate: 'Chestplate',
  boots: 'Boots',
  amulet: 'Amulet',
  weapon: 'Weapon',
};

export interface GearItem {
  id: string;
  slot: GearSlot;
  name: string;
  blurb: string;
  rarity: Rarity;
  /** Below this level the item can be held but not worn. */
  minLevel: number;
  bonus: Partial<Stats>;
}

/* -- what a rarity is worth -------------------------------------------------- */

/**
 * Rarity as a budget dealt down a slot's own stat order, rather than twenty
 * hand-tuned literals — the same shape as `dropChances` in `pets.ts`, and for
 * the same reason: a table can be read and argued with, a pile of numbers
 * cannot.
 *
 * Two things rise together, and both are the point of a drop. The **total**
 * rises (1 → 4 → 8 → 13), so a rarer item is worth more; and the **spread**
 * rises (one stat → four), so a rarer item is worth more *in more ways*. A
 * common item does one thing. A godly one touches the whole sheet.
 */
export const RARITY_BUDGET: Record<Rarity, number[]> = {
  common: [1],
  rare: [3, 1],
  epic: [5, 2, 1],
  godly: [7, 3, 2, 1],
};

export const RARITY_MIN_LEVEL: Record<Rarity, number> = {
  common: 1,
  rare: 4,
  epic: 9,
  godly: 16,
};

/**
 * Which stats a slot leans on, best first. Every slot lists all four, so a
 * godly item can spread across the whole sheet without any slot needing a
 * special case.
 *
 * The orders are the reason two godly items are not the same item. Note that
 * luck only ever nudges drop rarity and never a payout (`types.ts`), so the
 * luck-forward slots — the amulet especially — are a gambler's pick rather than
 * a strictly better one. Trading the amulet away for a second source of heart
 * is a real decision, which is the whole reason the slots exist.
 */
export const SLOT_STATS: Record<GearSlot, StatKey[]> = {
  // A clear head: MP first, then noticing things.
  helmet: ['insight', 'luck', 'heart', 'strength'],
  // Armour absorbs, so it is heart first and the swing behind it.
  chestplate: ['heart', 'strength', 'insight', 'luck'],
  // How far you get before you are spent, and what turns up on the way.
  boots: ['heart', 'luck', 'strength', 'insight'],
  // A keepsake: luck, and the clarity of carrying it.
  amulet: ['luck', 'insight', 'heart', 'strength'],
  // The one thing in the fight: damage, and the wind to keep swinging.
  weapon: ['strength', 'heart', 'insight', 'luck'],
};

/** The budget for `rarity`, dealt down `slot`'s stat order. */
export function bonusFor(slot: GearSlot, rarity: Rarity): Partial<Stats> {
  const order = SLOT_STATS[slot];
  const bonus: Partial<Stats> = {};
  RARITY_BUDGET[rarity].forEach((points, i) => { bonus[order[i]] = points; });
  return bonus;
}

/* -- the catalogue ----------------------------------------------------------- */

interface GearEntry {
  id: string;
  slot: GearSlot;
  name: string;
  rarity: Rarity;
  blurb: string;
}

/**
 * Named from the imagery in the letter rather than from stock fantasy: the
 * things these two have actually looked at together.
 *
 * The ids are older than the slot names and are deliberately left alone —
 * `head-paper-crown` is a helmet now, and renaming it would orphan it in every
 * stored `Avatar.gear`. Stats are not written here either; they come from the
 * rarity budget above, so the ladder cannot drift one item at a time.
 */
const CATALOGUE: GearEntry[] = [
  // Helmet -------------------------------------------------------------------
  { id: 'head-paper-crown', slot: 'helmet', name: 'Paper Crown', rarity: 'common',
    blurb: 'Folded from the back of a receipt, and worn seriously.' },
  { id: 'head-ribbon', slot: 'helmet', name: 'Red Ribbon', rarity: 'rare',
    blurb: 'Tied on the left. It has always been tied on the left.' },
  { id: 'head-stargazer-circlet', slot: 'helmet', name: "Stargazer's Circlet", rarity: 'epic',
    blurb: 'For the nights spent looking up from the car park.' },
  { id: 'head-aurora-veil', slot: 'helmet', name: 'Aurora Veil', rarity: 'godly',
    blurb: 'The sky doing something rare, worn on the head.' },

  // Chestplate ---------------------------------------------------------------
  { id: 'body-borrowed-hoodie', slot: 'chestplate', name: 'Borrowed Hoodie', rarity: 'common',
    blurb: 'Technically his. Functionally hers. Permanently.' },
  { id: 'body-lily-shawl', slot: 'chestplate', name: 'Lily Shawl', rarity: 'rare',
    blurb: 'Cream, with the flowers stitched rather than printed.' },
  { id: 'body-tidewalker-coat', slot: 'chestplate', name: 'Tidewalker Coat', rarity: 'epic',
    blurb: 'Salt-stiff at the hem from a beach in the winter.' },
  { id: 'body-hearthweave', slot: 'chestplate', name: 'Hearthweave', rarity: 'godly',
    blurb: 'Warm before you put it on. Nobody can explain it.' },

  // Boots --------------------------------------------------------------------
  { id: 'boots-odd-socks', slot: 'boots', name: 'Odd Socks', rarity: 'common',
    blurb: 'Neither pair survived the wash. These two get on fine.' },
  { id: 'boots-puddle-jumpers', slot: 'boots', name: 'Puddle Jumpers', rarity: 'rare',
    blurb: 'Green, a size too big, and entirely unbothered by rain.' },
  { id: 'boots-longstride', slot: 'boots', name: 'Longstride', rarity: 'epic',
    blurb: 'The pace that arrives on time without ever hurrying.' },
  { id: 'boots-sunday-morning', slot: 'boots', name: 'Sunday Morning', rarity: 'godly',
    blurb: 'Nowhere to be, and the whole of it to walk.' },

  // Amulet -------------------------------------------------------------------
  { id: 'charm-ticket-stub', slot: 'amulet', name: 'Ticket Stub', rarity: 'common',
    blurb: 'From the first one. Kept in a wallet, gone soft at the folds.' },
  { id: 'charm-pressed-lily', slot: 'amulet', name: 'Pressed Lily', rarity: 'rare',
    blurb: 'Flat, brittle, and completely irreplaceable.' },
  { id: 'charm-north-star', slot: 'amulet', name: 'North Star', rarity: 'epic',
    blurb: 'The one you can find without looking it up.' },
  { id: 'charm-heartbeat', slot: 'amulet', name: 'Heartbeat', rarity: 'godly',
    blurb: 'Audible through a jumper, at the right distance.' },

  // Weapon -------------------------------------------------------------------
  { id: 'weapon-wooden-spoon', slot: 'weapon', name: 'Wooden Spoon', rarity: 'common',
    blurb: 'Undefeated in the kitchen. Untested elsewhere.' },
  { id: 'weapon-ember-brand', slot: 'weapon', name: 'Ember Brand', rarity: 'rare',
    blurb: 'Keeps a coal alive overnight, which is most of the trick.' },
  { id: 'weapon-comet-lance', slot: 'weapon', name: 'Comet Lance', rarity: 'epic',
    blurb: 'Points at the thing you have been avoiding.' },
  { id: 'weapon-second-wind', slot: 'weapon', name: 'Second Wind', rarity: 'godly',
    blurb: 'Not a weapon. Wins fights anyway.' },
];

export const GEAR: GearItem[] = CATALOGUE.map((entry) => ({
  ...entry,
  minLevel: RARITY_MIN_LEVEL[entry.rarity],
  bonus: bonusFor(entry.slot, entry.rarity),
}));

const BY_ID = new Map(GEAR.map((item) => [item.id, item]));

export function gearById(id: string): GearItem | undefined {
  return BY_ID.get(id);
}

export function gearForSlot(slot: GearSlot): GearItem[] {
  return GEAR.filter((item) => item.slot === slot).sort((a, b) => a.minLevel - b.minLevel);
}

export function canEquip(item: GearItem, level: number): boolean {
  return level >= item.minLevel;
}

export type Equipped = Partial<Record<GearSlot, string>>;

/**
 * A gear map as it may actually be on disk, which is not always `Equipped`.
 *
 * Rows written before the slot rename still hang their items on `head`, `body`
 * and `charm`. Every function below normalises those on the way in, so the
 * types have to admit them — typing the input as `Equipped` would declare the
 * old shape impossible while the migration underneath exists precisely because
 * it is not.
 */
export type StoredGear = Readonly<Record<string, string | undefined>>;

/* -- the old slot keys ------------------------------------------------------- */

/**
 * Three slots were renamed after avatars had already been saved wearing them.
 *
 * This has to be handled rather than assumed away: `gearBonus` skips an item
 * whose `slot` disagrees with the key it was filed under, so a bare rename
 * would have taken everyone's gear off without a single error to show for it.
 */
export const LEGACY_SLOT_KEYS: Record<string, GearSlot> = {
  head: 'helmet',
  body: 'chestplate',
  charm: 'amulet',
};

/**
 * An old-shaped `gear` object read as a current one. Idempotent, so it is safe
 * on every load and safe to run twice; unrecognised keys are dropped rather
 * than carried, since nothing can wear them.
 *
 * A current key wins over a legacy one aimed at the same slot — a row caught
 * half-migrated should settle on the newer of the two.
 */
export function normalizeGear(gear: StoredGear): Equipped {
  const out: Equipped = {};
  const legacy: Equipped = {};
  for (const [key, value] of Object.entries(gear)) {
    if (!value) continue;
    if ((GEAR_SLOTS as string[]).includes(key)) out[key as GearSlot] = value;
    else if (LEGACY_SLOT_KEYS[key] && legacy[LEGACY_SLOT_KEYS[key]] === undefined) {
      legacy[LEGACY_SLOT_KEYS[key]] = value;
    }
  }
  for (const slot of GEAR_SLOTS) {
    if (out[slot] === undefined && legacy[slot] !== undefined) out[slot] = legacy[slot];
  }
  return out;
}

/** Whether `normalizeGear` would actually change this row. */
export function needsGearMigration(gear: StoredGear): boolean {
  const normalized = normalizeGear(gear);
  const worn = Object.keys(gear).filter((key) => gear[key]);
  if (worn.length !== Object.keys(normalized).length) return true;
  return worn.some((key) => normalized[key as GearSlot] !== gear[key]);
}

/**
 * What the worn set is worth. An item above its level gate contributes nothing
 * rather than throwing — a level that fell (it cannot, but a corrupt row could)
 * should dim the sheet, not break the page.
 */
export function gearBonus(equipped: StoredGear, level: number): Partial<Stats> {
  const worn = normalizeGear(equipped);
  let total: Stats = { strength: 0, insight: 0, heart: 0, luck: 0 };
  for (const slot of GEAR_SLOTS) {
    const item = worn[slot] ? gearById(worn[slot] as string) : undefined;
    if (!item || item.slot !== slot || !canEquip(item, level)) continue;
    total = addStats(total, item.bonus);
  }
  return total;
}

export function equip(equipped: StoredGear, itemId: string, level: number):
  { ok: true; equipped: Equipped } | { ok: false; reason: string } {
  const item = gearById(itemId);
  if (!item) return { ok: false, reason: 'No such item.' };
  if (!canEquip(item, level)) {
    return { ok: false, reason: `${item.name} is worn from level ${item.minLevel}.` };
  }
  // Normalising on the way through means a row heals itself the first time its
  // owner touches the wardrobe, without a migration pass having to find it.
  return { ok: true, equipped: { ...normalizeGear(equipped), [item.slot]: item.id } };
}

export function unequip(equipped: StoredGear, slot: GearSlot): Equipped {
  const next = normalizeGear(equipped);
  delete next[slot];
  return next;
}
