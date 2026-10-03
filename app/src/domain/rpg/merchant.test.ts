import { describe, expect, it } from 'vitest';
import { GEAR } from './gear';
import {
  DISCOUNT_MAX, DISCOUNT_MIN, MERCHANT_TIERS, STOCK, dealById, dealsFor,
} from './merchant';

const DAYS = Array.from({ length: 120 }, (_, i) =>
  new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));

describe('the merchant shelf', () => {
  it('is the same for the same day, every time', () => {
    for (const day of DAYS) expect(dealsFor(day)).toEqual(dealsFor(day));
  });

  it('stocks a short, fixed-size shelf with no duplicates', () => {
    const total = STOCK.common + STOCK.epic + STOCK.decor + STOCK.dye;
    for (const day of DAYS) {
      const deals = dealsFor(day);
      expect(deals).toHaveLength(total);
      expect(new Set(deals.map((d) => d.id)).size).toBe(total);
    }
  });

  it('never sells a chest-only tier', () => {
    for (const day of DAYS) {
      for (const deal of dealsFor(day).filter((d) => d.kind === 'gear')) {
        expect(MERCHANT_TIERS, deal.id).toContain(deal.rarity);
        expect(GEAR.find((g) => g.id === deal.id), deal.id).toBeDefined();
      }
    }
  });

  it('takes between the minimum and maximum off, and always charges less than list', () => {
    for (const day of DAYS) {
      for (const deal of dealsFor(day)) {
        expect(deal.percentOff, deal.id).toBeGreaterThanOrEqual(DISCOUNT_MIN);
        expect(deal.percentOff, deal.id).toBeLessThanOrEqual(DISCOUNT_MAX);
        expect(deal.price, deal.id).toBeLessThan(deal.listPrice);
        expect(deal.price, deal.id).toBeGreaterThan(0);
      }
    }
  });

  it('changes from day to day, and over four months stocks every piece it may sell', () => {
    const shelves = new Set(DAYS.map((day) => dealsFor(day).map((d) => d.id).join()));
    expect(shelves.size).toBeGreaterThan(DAYS.length / 2);
    const seen = new Set(DAYS.flatMap((day) => dealsFor(day).map((d) => d.id)));
    const sellable = GEAR.filter((g) => MERCHANT_TIERS.includes(g.rarity));
    const missing = sellable.filter((g) => !seen.has(g.id)).map((g) => g.id);
    expect(missing).toEqual([]);
  });

  it('looks a deal up only on the day it is stocked', () => {
    const [first] = dealsFor(DAYS[0]);
    expect(dealById(DAYS[0], first.id)).toEqual(first);
    expect(dealById(DAYS[0], 'gear-not-a-thing')).toBeUndefined();
  });
});
