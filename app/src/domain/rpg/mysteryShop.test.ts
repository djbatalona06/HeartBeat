import { describe, expect, it } from 'vitest';
import { addDays } from '../day';
import { DYES } from './dyes';
import { FURNITURE } from './furniture';
import { OFFER_DISCOUNT, offerFor, offerPrice } from './mysteryShop';

/**
 * The offer is derived rather than stored, so the property that replaces "the
 * row says so" is determinism: both phones must land on the same accessory
 * from the day alone, and it must stay put for the whole of that day.
 */

const DAY = '2026-09-13';

describe('offerFor', () => {
  it('gives the same offer every time it is asked, on the same day', () => {
    const once = offerFor(DAY);
    expect(once).toBeDefined();
    for (let i = 0; i < 50; i += 1) expect(offerFor(DAY)).toEqual(once);
  });

  it('actually rotates across a month rather than sitting still', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i += 1) seen.add(offerFor(addDays(DAY, i))!.id);
    // Not a demand for thirty different items from a pool of a dozen — only
    // that this is a rotation and not a constant.
    expect(seen.size).toBeGreaterThan(3);
  });

  it('always has something to sell', () => {
    for (let i = 0; i < 400; i += 1) {
      expect(offerFor(addDays(DAY, i)), `day +${i}`).toBeDefined();
    }
  });

  it('never offers a third off nothing', () => {
    const free = new Set(DYES.filter((d) => d.price === 0).map((d) => d.id));
    expect(free.size).toBeGreaterThan(0); // the case is real, not hypothetical
    for (let i = 0; i < 400; i += 1) {
      expect(free.has(offerFor(addDays(DAY, i))!.id), `day +${i}`).toBe(false);
    }
  });

  it('only ever offers something that is really in a catalogue', () => {
    const known = new Map<string, number>([
      ...DYES.map((d) => [d.id, d.price] as const),
      ...FURNITURE.map((f) => [f.id, f.price] as const),
    ]);
    for (let i = 0; i < 200; i += 1) {
      const offer = offerFor(addDays(DAY, i))!;
      expect(known.get(offer.id), offer.id).toBe(offer.listPrice);
      expect(offer.price).toBe(offerPrice(offer.listPrice));
    }
  });

  it('names the kind so the buyer knows which shelf it came off', () => {
    const dyes = new Set(DYES.map((d) => d.id));
    for (let i = 0; i < 200; i += 1) {
      const offer = offerFor(addDays(DAY, i))!;
      expect(offer.kind).toBe(dyes.has(offer.id) ? 'dye' : 'decor');
    }
  });
});

describe('offerPrice', () => {
  it('takes the discount off, rounding up', () => {
    expect(offerPrice(100)).toBe(70);
    expect(offerPrice(90)).toBe(63);
    expect(offerPrice(120)).toBe(84);
    expect(offerPrice(150)).toBe(105);
  });

  it('is always cheaper than the list price, for every price in the game', () => {
    for (const listPrice of [...DYES, ...FURNITURE].map((i) => i.price)) {
      if (listPrice === 0) continue;
      expect(offerPrice(listPrice), String(listPrice)).toBeLessThan(listPrice);
    }
  });

  it('never reaches free, however small the item', () => {
    for (const listPrice of [1, 2, 3, 10]) {
      expect(offerPrice(listPrice), String(listPrice)).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns whole coins only', () => {
    for (let price = 1; price <= 500; price += 1) {
      expect(Number.isInteger(offerPrice(price)), String(price)).toBe(true);
    }
  });

  it('discounts by the stated amount and not some other one', () => {
    expect(OFFER_DISCOUNT).toBeGreaterThan(0);
    expect(OFFER_DISCOUNT).toBeLessThan(1);
    expect(offerPrice(1000)).toBe(Math.ceil(1000 * (1 - OFFER_DISCOUNT)));
  });
});
