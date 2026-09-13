import type { DayKey } from '../types';
import { pickForDay } from '../day';
import { DYES } from './dyes';
import { FURNITURE } from './furniture';

/**
 * One accessory a day, cheaper than usual.
 *
 * The brief this came from asks for a "limited-time shop" that is
 * "scarcity-driven" and exists to "create urgency and drive impulse purchases".
 * Two of those three are taken here and the third is refused, deliberately and
 * on the record.
 *
 * **Taken:** a rotating offer, and a real discount. Both are good — a shop that
 * never changes stops being looked at, and a price that is only ever the list
 * price gives a coin balance nothing to be clever about.
 *
 * **Refused: the clock.** There is no countdown anywhere in this module and
 * none in the screen that renders it. A timer on a purchase is not information,
 * it is a device for stopping somebody thinking, and the currency here is
 * earned by logging a mood and finishing a task — so the only thing urgency
 * could buy is the feeling of having been rushed by an app two people use to
 * look after each other. The card says it changes daily and stops there.
 *
 * ### Derived, never stored
 *
 * The obvious shape is a `shop_offers` table keyed by couple with an
 * `expires_at`, a Worker cron to fill it, and a rule for what happens when the
 * clock turns over mid-purchase. None of that is needed: `pickForDay` is
 * already in `domain/day.ts` with five callers, and a pure function of the day
 * gives both phones the same answer from data they already hold. No table, no
 * cron, no sync, and nothing that can disagree between devices.
 *
 * The trade-off, stated rather than discovered later: `pickForDay` hashes the
 * *day* and nothing else, so every couple sees the same offer on the same day.
 * For an app whose entire population is two people that costs nothing, and it
 * is what buys the absence of the table.
 */

/** A third off, rounded up. Enough to be worth waiting a day for, not enough
 *  that the list price starts reading as a fiction. */
export const OFFER_DISCOUNT = 0.3;

export interface Offer {
  /** An inventory id — already prefixed, so `dye-` or `decor-`. */
  id: string;
  name: string;
  blurb: string;
  kind: 'dye' | 'decor';
  /** What it costs on any other day. */
  listPrice: number;
  /** What it costs today. */
  price: number;
}

/**
 * Everything that can go on offer.
 *
 * Free dyes are excluded: a third off nothing is not an offer, and putting one
 * in the rotation would mean a day where the shop has nothing to say.
 */
function pool(): Offer[] {
  const dyes = DYES.filter((dye) => dye.price > 0).map((dye): Offer => ({
    id: dye.id,
    name: dye.name,
    blurb: dye.blurb,
    kind: 'dye',
    listPrice: dye.price,
    price: offerPrice(dye.price),
  }));

  const decor = FURNITURE.map((item): Offer => ({
    id: item.id,
    name: item.name,
    blurb: item.blurb,
    kind: 'decor',
    listPrice: item.price,
    price: offerPrice(item.price),
  }));

  // Sorted by id so the pool's order is a property of the catalogue rather
  // than of the order two arrays happened to be concatenated in — otherwise
  // adding a dye would silently reshuffle which day every other item falls on.
  return [...dyes, ...decor].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Rounded up, and floored at one coin.
 *
 * Up rather than down because a discount that rounds in the shop's favour by a
 * coin is not worth the sentence explaining it, and the floor because a free
 * accessory would route around the whole economy.
 */
export function offerPrice(listPrice: number): number {
  return Math.max(1, Math.ceil(listPrice * (1 - OFFER_DISCOUNT)));
}

/** Today's offer. The same for both phones, and for the whole of the day. */
export function offerFor(day: DayKey): Offer | undefined {
  return pickForDay(day, pool());
}
