import { hash } from '../hash';
import type { DayKey } from '../types';
import { DYES } from './dyes';
import { FURNITURE } from './furniture';
import { GEAR, type Rarity } from './gear';
import { GEAR_PRICE } from './shop';

/**
 * The merchant: a short, changing shelf instead of the whole catalogue.
 *
 * The drawer used to list every gear piece and every piece of furniture at full
 * price -- forty items and a wall of numbers to open a shop that is mostly
 * there to spend a few coins. Now it stocks a handful each day, all of them
 * cheaper than they are anywhere else, and the same handful on both phones.
 *
 * ## Same stock on both phones
 *
 * A pure function of the day and the catalogue: each candidate is ranked by
 * `hash(day + id)` and the first few are taken. No member, no ownership, no
 * clock beyond the day key. Owned items stay on the shelf (marked owned) rather
 * than being removed, or two phones with different bags would be shown
 * different shelves.
 *
 * Ranking by hash rather than indexing into a list means adding an item to the
 * catalogue changes a day's shelf only if the newcomer outranks someone, not
 * every day after it -- the same property `mysteryShop` gets by sorting by id.
 *
 * ## What is never on the shelf
 *
 * Legendary and mythic gear. Those are what chests are for, and a discount
 * counter that sold them for a few hundred coins would make the chests a worse
 * way to get the same thing. `MERCHANT_TIERS` is the one place to change that.
 */

export const MERCHANT_TIERS: readonly Rarity[] = ['common', 'rare', 'epic'];

/** How many of each the shelf holds. */
export const STOCK = { common: 2, epic: 1, decor: 2, dye: 1 } as const;

/** Every deal is between these, inclusive, and seeded per item per day. */
export const DISCOUNT_MIN = 20;
export const DISCOUNT_MAX = 35;

export type DealKind = 'gear' | 'decor' | 'dye';

export interface Deal {
  /** An inventory id, already prefixed. */
  id: string;
  kind: DealKind;
  name: string;
  blurb: string;
  /** What it costs on any other day, or anywhere else. */
  listPrice: number;
  price: number;
  /** Percent off, for the label. */
  percentOff: number;
  /** Gear only. */
  rarity?: Rarity;
}

function percentOff(day: DayKey, id: string): number {
  return DISCOUNT_MIN + (hash(`${day}:${id}:off`) % (DISCOUNT_MAX - DISCOUNT_MIN + 1));
}

function dealPrice(listPrice: number, off: number): number {
  return Math.max(1, Math.ceil((listPrice * (100 - off)) / 100));
}

/** The first `count` of `pool`, ranked by a hash of the day and each id. */
function rank<T extends { id: string }>(day: DayKey, pool: readonly T[], count: number): T[] {
  return [...pool]
    .sort((a, b) => hash(`${day}:${a.id}`) - hash(`${day}:${b.id}`) || a.id.localeCompare(b.id))
    .slice(0, count);
}

export function dealsFor(day: DayKey): Deal[] {
  const gear = GEAR.filter((item) => MERCHANT_TIERS.includes(item.rarity));
  const low = gear.filter((item) => item.rarity !== 'epic');
  const epic = gear.filter((item) => item.rarity === 'epic');

  const make = (
    kind: DealKind,
    item: { id: string; name: string; blurb: string },
    listPrice: number,
    rarity?: Rarity,
  ): Deal => {
    const off = percentOff(day, item.id);
    return {
      id: item.id, kind, name: item.name, blurb: item.blurb, listPrice,
      price: dealPrice(listPrice, off), percentOff: off, rarity,
    };
  };

  return [
    ...rank(day, low, STOCK.common).map((i) => make('gear', i, GEAR_PRICE[i.rarity], i.rarity)),
    ...rank(day, epic, STOCK.epic).map((i) => make('gear', i, GEAR_PRICE[i.rarity], i.rarity)),
    ...rank(day, FURNITURE, STOCK.decor).map((i) => make('decor', i, i.price)),
    ...rank(day, DYES.filter((d) => d.price > 0), STOCK.dye).map((i) => make('dye', i, i.price)),
  ];
}

export function dealById(day: DayKey, id: string): Deal | undefined {
  return dealsFor(day).find((deal) => deal.id === id);
}
