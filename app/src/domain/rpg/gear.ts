import { GEAR_SLOTS, type GearSlot, type Stats } from './types';
import { addStats } from './avatar';

/**
 * Four slots, one item each. Gear is the only thing that breaks the
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

/**
 * Named from the imagery in the letter rather than from stock fantasy: the
 * things these two have actually looked at together.
 */
export const GEAR: GearItem[] = [
  // Head ---------------------------------------------------------------------
  { id: 'head-paper-crown', slot: 'head', name: 'Paper Crown', rarity: 'common', minLevel: 1,
    bonus: { insight: 1 }, blurb: 'Folded from the back of a receipt, and worn seriously.' },
  { id: 'head-ribbon', slot: 'head', name: 'Red Ribbon', rarity: 'rare', minLevel: 4,
    bonus: { insight: 2, luck: 1 }, blurb: 'Tied on the left. It has always been tied on the left.' },
  { id: 'head-stargazer-circlet', slot: 'head', name: "Stargazer's Circlet", rarity: 'epic', minLevel: 9,
    bonus: { insight: 4, luck: 2 }, blurb: 'For the nights spent looking up from the car park.' },
  { id: 'head-aurora-veil', slot: 'head', name: 'Aurora Veil', rarity: 'godly', minLevel: 16,
    bonus: { insight: 6, luck: 3, heart: 2 }, blurb: 'The sky doing something rare, worn on the head.' },

  // Body ---------------------------------------------------------------------
  { id: 'body-borrowed-hoodie', slot: 'body', name: 'Borrowed Hoodie', rarity: 'common', minLevel: 1,
    bonus: { heart: 1 }, blurb: 'Technically his. Functionally hers. Permanently.' },
  { id: 'body-lily-shawl', slot: 'body', name: 'Lily Shawl', rarity: 'rare', minLevel: 4,
    bonus: { heart: 3 }, blurb: 'Cream, with the flowers stitched rather than printed.' },
  { id: 'body-tidewalker-coat', slot: 'body', name: 'Tidewalker Coat', rarity: 'epic', minLevel: 9,
    bonus: { heart: 5, strength: 1 }, blurb: 'Salt-stiff at the hem from a beach in the winter.' },
  { id: 'body-hearthweave', slot: 'body', name: 'Hearthweave', rarity: 'godly', minLevel: 16,
    bonus: { heart: 8, strength: 2 }, blurb: 'Warm before you put it on. Nobody can explain it.' },

  // Weapon -------------------------------------------------------------------
  { id: 'weapon-wooden-spoon', slot: 'weapon', name: 'Wooden Spoon', rarity: 'common', minLevel: 1,
    bonus: { strength: 1 }, blurb: 'Undefeated in the kitchen. Untested elsewhere.' },
  { id: 'weapon-ember-brand', slot: 'weapon', name: 'Ember Brand', rarity: 'rare', minLevel: 4,
    bonus: { strength: 3 }, blurb: 'Keeps a coal alive overnight, which is most of the trick.' },
  { id: 'weapon-comet-lance', slot: 'weapon', name: 'Comet Lance', rarity: 'epic', minLevel: 9,
    bonus: { strength: 5, insight: 1 }, blurb: 'Points at the thing you have been avoiding.' },
  { id: 'weapon-second-wind', slot: 'weapon', name: 'Second Wind', rarity: 'godly', minLevel: 16,
    bonus: { strength: 7, heart: 2 }, blurb: 'Not a weapon. Wins fights anyway.' },

  // Charm --------------------------------------------------------------------
  { id: 'charm-ticket-stub', slot: 'charm', name: 'Ticket Stub', rarity: 'common', minLevel: 1,
    bonus: { luck: 1 }, blurb: 'From the first one. Kept in a wallet, gone soft at the folds.' },
  { id: 'charm-pressed-lily', slot: 'charm', name: 'Pressed Lily', rarity: 'rare', minLevel: 4,
    bonus: { luck: 2, insight: 1 }, blurb: 'Flat, brittle, and completely irreplaceable.' },
  { id: 'charm-north-star', slot: 'charm', name: 'North Star', rarity: 'epic', minLevel: 9,
    bonus: { luck: 4, insight: 2 }, blurb: 'The one you can find without looking it up.' },
  { id: 'charm-heartbeat', slot: 'charm', name: 'Heartbeat', rarity: 'godly', minLevel: 16,
    bonus: { luck: 5, heart: 4, insight: 2 }, blurb: 'Audible through a jumper, at the right distance.' },
];

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
 * What the worn set is worth. An item above its level gate contributes nothing
 * rather than throwing — a level that fell (it cannot, but a corrupt row could)
 * should dim the sheet, not break the page.
 */
export function gearBonus(equipped: Equipped, level: number): Partial<Stats> {
  let total: Stats = { strength: 0, insight: 0, heart: 0, luck: 0 };
  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot] ? gearById(equipped[slot] as string) : undefined;
    if (!item || item.slot !== slot || !canEquip(item, level)) continue;
    total = addStats(total, item.bonus);
  }
  return total;
}

export function equip(equipped: Equipped, itemId: string, level: number):
  { ok: true; equipped: Equipped } | { ok: false; reason: string } {
  const item = gearById(itemId);
  if (!item) return { ok: false, reason: 'No such item.' };
  if (!canEquip(item, level)) {
    return { ok: false, reason: `${item.name} is worn from level ${item.minLevel}.` };
  }
  return { ok: true, equipped: { ...equipped, [item.slot]: item.id } };
}

export function unequip(equipped: Equipped, slot: GearSlot): Equipped {
  const next = { ...equipped };
  delete next[slot];
  return next;
}
