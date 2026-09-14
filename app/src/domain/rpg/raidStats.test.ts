import { describe, expect, it } from 'vitest';
import {
  FURNITURE_RAID_ORDER, GEAR_RAID_ORDER, RAID_STATS, RAID_STAT_BLURBS, RAID_STAT_NAMES,
  SPECIES_RAID_ORDER, SPREAD_SHARES, ZERO_RAID_STATS, addRaidStats, dealStatLevel, raidSheet,
  sourceStatLevel, tierForPrice, type RaidStatKey, type StatSource,
} from './raidStats';
import { GEAR_PRICE } from './shop';
import { TIERS, TIER_STAT_LEVELS, passiveFor } from './tiers';
import { GEAR_SLOTS } from './types';

const sum = (stats: Partial<Record<RaidStatKey, number>>) =>
  RAID_STATS.reduce((total, key) => total + (stats[key] ?? 0), 0);

describe('the seven', () => {
  it('names and explains every one of them', () => {
    expect(RAID_STATS).toHaveLength(7);
    for (const key of RAID_STATS) {
      expect(RAID_STAT_NAMES[key]).toBeTruthy();
      expect(RAID_STAT_BLURBS[key]).toBeTruthy();
    }
  });

  it('starts at nothing, and adding nothing changes nothing', () => {
    expect(sum(ZERO_RAID_STATS)).toBe(0);
    expect(addRaidStats(ZERO_RAID_STATS, {})).toEqual(ZERO_RAID_STATS);
  });

  it('adds without mutating what it was handed', () => {
    const base = { ...ZERO_RAID_STATS, burden: 4 };
    const added = addRaidStats(base, { burden: 3, reveal: 2 });
    expect(added.burden).toBe(7);
    expect(added.reveal).toBe(2);
    expect(base.burden).toBe(4);
  });
});

describe('dealing a stat level out', () => {
  const order: RaidStatKey[] = ['burden', 'energy', 'fortify', 'reveal'];

  it('spends exactly the level it is given, at every level', () => {
    for (let level = 1; level <= 50; level += 1) {
      expect(sum(dealStatLevel(level, order)), `level ${level}`).toBe(level);
    }
  });

  it('gives the most to the stat the thing is named for', () => {
    const dealt = dealStatLevel(20, order);
    expect(dealt.burden).toBeGreaterThan(dealt.energy ?? 0);
    expect(dealt.energy ?? 0).toBeGreaterThanOrEqual(dealt.fortify ?? 0);
    expect(dealt.fortify ?? 0).toBeGreaterThanOrEqual(dealt.reveal ?? 0);
  });

  it('never touches a stat outside its own order', () => {
    const dealt = dealStatLevel(50, order);
    expect(dealt.resilience).toBeUndefined();
    expect(dealt.resonance).toBeUndefined();
    expect(dealt.recovery).toBeUndefined();
  });

  it('is nothing for nothing, and never negative', () => {
    expect(dealStatLevel(0, order)).toEqual({});
    expect(dealStatLevel(-9, order)).toEqual({});
    expect(dealStatLevel(7, [])).toEqual({});
  });

  it('copes with an order shorter than the shares', () => {
    expect(sum(dealStatLevel(13, ['burden', 'energy']))).toBe(13);
    expect(sum(dealStatLevel(13, ['burden']))).toBe(13);
  });

  it('gives a level of one to the primary and nowhere else', () => {
    expect(dealStatLevel(1, order)).toEqual({ burden: 1 });
  });

  it('shares taper, so the spread has a shape rather than being flat', () => {
    for (let i = 1; i < SPREAD_SHARES.length; i += 1) {
      expect(SPREAD_SHARES[i]).toBeLessThan(SPREAD_SHARES[i - 1]);
    }
  });
});

describe('the orders', () => {
  it('covers every gear slot, every house slot, every species', () => {
    for (const slot of GEAR_SLOTS) expect(GEAR_RAID_ORDER[slot]).toBeTruthy();
    for (const order of Object.values(FURNITURE_RAID_ORDER)) expect(order.length).toBe(4);
    for (const order of Object.values(SPECIES_RAID_ORDER)) expect(order.length).toBe(4);
  });

  it('never repeats a stat inside one order', () => {
    const orders = [
      ...Object.values(GEAR_RAID_ORDER),
      ...Object.values(FURNITURE_RAID_ORDER),
      ...Object.values(SPECIES_RAID_ORDER),
    ];
    for (const order of orders) expect(new Set(order).size).toBe(order.length);
  });

  it('gives each gear slot a different thing to be for', () => {
    const primaries = GEAR_SLOTS.map((slot) => GEAR_RAID_ORDER[slot][0]);
    expect(new Set(primaries).size).toBe(GEAR_SLOTS.length);
  });

  /** A room does not help you hit anything. That is what a room is. */
  it('keeps Burden out of the furniture entirely', () => {
    for (const order of Object.values(FURNITURE_RAID_ORDER)) {
      expect(order).not.toContain('burden');
    }
  });
});

describe('tier from price', () => {
  it('reads each rung off the gear ladder it is priced against', () => {
    for (const tier of TIERS) expect(tierForPrice(GEAR_PRICE[tier])).toBe(tier);
  });

  it('puts a free thing on the bottom rung rather than off the ladder', () => {
    expect(tierForPrice(0)).toBe('common');
    expect(tierForPrice(-10)).toBe('common');
  });

  it('never jumps a rung early', () => {
    expect(tierForPrice(GEAR_PRICE.rare - 1)).toBe('common');
    expect(tierForPrice(GEAR_PRICE.mythic - 1)).toBe('legendary');
    expect(tierForPrice(999_999)).toBe('mythic');
  });

  it('places the furniture prices that prompted it', () => {
    expect(tierForPrice(120)).toBe('rare');
    expect(tierForPrice(180)).toBe('rare');
  });
});

describe('a stat level from an id', () => {
  it('stays inside the tier band', () => {
    for (const tier of TIERS) {
      const band = TIER_STAT_LEVELS[tier];
      for (const id of ['decor-window-rain', 'dye-plum', 'cat-mythic', 'x', '']) {
        const level = sourceStatLevel(id, tier);
        expect(level, `${id} ${tier}`).toBeGreaterThanOrEqual(band.min);
        expect(level, `${id} ${tier}`).toBeLessThanOrEqual(band.max);
      }
    }
  });

  it('is the same answer every time, which is the entire point', () => {
    expect(sourceStatLevel('decor-floor-rug', 'rare'))
      .toBe(sourceStatLevel('decor-floor-rug', 'rare'));
  });
});

describe('the sheet', () => {
  const source = (over: Partial<StatSource> = {}): StatSource => ({
    id: 'a', label: 'A', tier: 'common', statLevel: 4,
    order: ['burden', 'energy', 'fortify', 'reveal'],
    ...over,
  });

  it('is all zeroes with nothing owned', () => {
    const sheet = raidSheet([]);
    expect(sum(sheet.base)).toBe(0);
    expect(sum(sheet.total)).toBe(0);
    expect(sheet.sources).toEqual([]);
  });

  it('adds the flat points up before anything lifts them', () => {
    const sheet = raidSheet([source({ statLevel: 8 }), source({ id: 'b', statLevel: 12 })]);
    expect(sum(sheet.base)).toBe(20);
  });

  it('lands a passive on the stat the source is named for, and nowhere else', () => {
    const sheet = raidSheet([source({ tier: 'mythic', statLevel: 50 })]);
    expect(sheet.passives.burden).toBeGreaterThan(0);
    expect(sheet.passives.energy).toBe(0);
    expect(sheet.passives.fortify).toBe(0);
  });

  it('gives a common source no passive at all', () => {
    const sheet = raidSheet([source({ tier: 'common', statLevel: 3 })]);
    for (const key of RAID_STATS) expect(sheet.passives[key]).toBe(0);
    expect(sheet.total).toEqual(sheet.base);
  });

  it('lifts the total by exactly the passive it reports', () => {
    const sheet = raidSheet([source({ tier: 'epic', statLevel: 20 })]);
    expect(sheet.total.burden).toBe(Math.round(sheet.base.burden * (1 + sheet.passives.burden)));
  });

  it('discounts a second source of the same buff', () => {
    const one = raidSheet([source({ tier: 'epic', statLevel: 20 })]);
    const two = raidSheet([
      source({ tier: 'epic', statLevel: 20 }),
      source({ id: 'b', tier: 'epic', statLevel: 20 }),
    ]);
    const single = passiveFor('epic', 20) / 100;
    expect(two.passives.burden).toBeGreaterThan(one.passives.burden);
    expect(two.passives.burden).toBeLessThan(single * 2);
  });

  it('does not care what order things were equipped in', () => {
    const a = source({ id: 'a', tier: 'rare', statLevel: 6 });
    const b = source({ id: 'b', tier: 'mythic', statLevel: 44 });
    const c = source({ id: 'c', tier: 'epic', statLevel: 14 });
    expect(raidSheet([a, b, c]).total).toEqual(raidSheet([c, a, b]).total);
  });

  it('keeps every source, so a total can say where it came from', () => {
    const sheet = raidSheet([source({ id: 'a', label: 'Paper Crown' })]);
    expect(sheet.sources.map((s) => s.label)).toEqual(['Paper Crown']);
  });

  it('never invents a negative', () => {
    const sheet = raidSheet([source({ statLevel: -5 }), source({ id: 'b', statLevel: 0 })]);
    for (const key of RAID_STATS) expect(sheet.total[key]).toBeGreaterThanOrEqual(0);
  });
});
