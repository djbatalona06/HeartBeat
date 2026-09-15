import { describe, expect, it } from 'vitest';
import {
  FLORA, FLORA_PREFIX, PLOTS, emptyPlots, floraById, floraTier, normalizeGarden, plantIn,
  plotById, plotsAt, type Garden,
} from './plots';
import { MAX_LEVEL } from '../xp';
import { unlockedPlots } from './milestones';
import { RAID_STATS } from './raidStats';
import { TIERS, tierRank } from './tiers';
import { GEAR_PRICE } from './shop';

describe('the ground', () => {
  it('gives every plot a name, a place and something to be for', () => {
    for (const plot of PLOTS) {
      expect(plot.name, plot.id).toBeTruthy();
      expect(plot.blurb.length, plot.id).toBeGreaterThan(20);
      expect(plot.x, plot.id).toBeGreaterThanOrEqual(-1);
      expect(plot.x, plot.id).toBeLessThanOrEqual(1);
      expect(plot.depth, plot.id).toBeGreaterThanOrEqual(0);
      expect(plot.depth, plot.id).toBeLessThanOrEqual(1);
      expect(plot.order, plot.id).toHaveLength(4);
      for (const stat of plot.order) expect(RAID_STATS).toContain(stat);
      expect(new Set(plot.order).size, plot.id).toBe(4);
    }
  });

  it('gives every plot a unique id and a unique spot', () => {
    expect(new Set(PLOTS.map((p) => p.id)).size).toBe(PLOTS.length);
    expect(new Set(PLOTS.map((p) => `${p.x},${p.depth}`)).size).toBe(PLOTS.length);
  });

  /** A garden does not help you hit anything. Same ruling the birbhouse made. */
  it('keeps Burden out of the ground entirely', () => {
    for (const plot of PLOTS) expect(plot.order).not.toContain('burden');
  });

  it('is exactly what the level ladder opens', () => {
    expect(plotsAt(MAX_LEVEL).map((p) => p.id).sort())
      .toEqual(unlockedPlots(MAX_LEVEL).sort());
    expect(plotsAt(1)).toEqual([]);
  });

  it('finds one by id, and nothing for ground that does not exist', () => {
    expect(plotById(PLOTS[0].id)!.name).toBe(PLOTS[0].name);
    expect(plotById('plot-the-moon')).toBeUndefined();
    expect(plotById(undefined)).toBeUndefined();
  });
});

describe('what grows in it', () => {
  it('prefixes every id, so the shared inventory table cannot collide', () => {
    for (const flora of FLORA) expect(flora.id.startsWith(FLORA_PREFIX), flora.id).toBe(true);
  });

  it('gives every plant a name, a price and a drawing to be', () => {
    for (const flora of FLORA) {
      expect(flora.name, flora.id).toBeTruthy();
      expect(flora.blurb.length, flora.id).toBeGreaterThan(20);
      expect(flora.price, flora.id).toBeGreaterThan(0);
      expect(flora.art, flora.id).toBeTruthy();
    }
    expect(new Set(FLORA.map((f) => f.art)).size).toBe(FLORA.length);
  });

  it('reads its rung off the gear ladder it is priced against', () => {
    for (const flora of FLORA) {
      expect(TIERS, flora.id).toContain(floraTier(flora));
      expect(flora.price, flora.id).toBeGreaterThanOrEqual(GEAR_PRICE[floraTier(flora)]);
    }
  });

  /** The top rung should be something you won, not something you saved up for. */
  it('sells nothing mythic', () => {
    for (const flora of FLORA) {
      expect(tierRank(floraTier(flora)), flora.id).toBeLessThan(tierRank('mythic'));
    }
  });

  it('finds one by id, and nothing for a plant nobody sells', () => {
    expect(floraById(FLORA[0].id)!.name).toBe(FLORA[0].name);
    expect(floraById('flora-triffid')).toBeUndefined();
    expect(floraById(undefined)).toBeUndefined();
  });
});

describe('planting', () => {
  const plot = PLOTS[0].id;
  const later = PLOTS[PLOTS.length - 1].id;
  const rose = FLORA[0].id;

  it('puts something in a plot that has been reached', () => {
    expect(plantIn({}, MAX_LEVEL, plot, rose)).toEqual({ [plot]: rose });
  });

  it('refuses ground nobody has levelled into yet', () => {
    expect(plantIn({}, 2, later, rose)).toEqual({});
  });

  it('refuses a plant nobody sells, and a plot that does not exist', () => {
    expect(plantIn({}, MAX_LEVEL, plot, 'flora-triffid')).toEqual({});
    expect(plantIn({}, MAX_LEVEL, 'plot-the-moon', rose)).toEqual({});
  });

  it('clears a plot when handed nothing', () => {
    expect(plantIn({ [plot]: rose }, MAX_LEVEL, plot, undefined)).toEqual({});
  });

  it('replaces rather than stacking', () => {
    const after = plantIn({ [plot]: rose }, MAX_LEVEL, plot, FLORA[1].id);
    expect(after).toEqual({ [plot]: FLORA[1].id });
  });

  it('leaves the garden it was handed alone', () => {
    const garden: Garden = { [plot]: rose };
    plantIn(garden, MAX_LEVEL, plot, FLORA[1].id);
    expect(garden).toEqual({ [plot]: rose });
  });
});

describe('normalising', () => {
  const plot = PLOTS[0].id;
  const later = PLOTS[PLOTS.length - 1].id;

  it('is empty for an empty garden', () => {
    expect(normalizeGarden(undefined, MAX_LEVEL)).toEqual({});
    expect(normalizeGarden({}, MAX_LEVEL)).toEqual({});
  });

  it('drops a plant retired from the catalogue', () => {
    expect(normalizeGarden({ [plot]: 'flora-triffid' }, MAX_LEVEL)).toEqual({});
  });

  it('drops a plot that is not ground', () => {
    expect(normalizeGarden({ 'plot-the-moon': FLORA[0].id }, MAX_LEVEL)).toEqual({});
  });

  /**
   * The case that matters. The plot ladder is derived from pet XP and pet XP is
   * reconciled against the server, so a device really can hold a garden briefly
   * ahead of the level it can prove.
   */
  it('drops ground this couple cannot reach yet, and gives it back when they can', () => {
    const garden: Garden = { [plot]: FLORA[0].id, [later]: FLORA[1].id };
    expect(normalizeGarden(garden, 2)).toEqual({ [plot]: FLORA[0].id });
    expect(normalizeGarden(garden, MAX_LEVEL)).toEqual(garden);
  });

  it('is idempotent, so it is safe on every load and safe run twice', () => {
    const garden: Garden = { [plot]: FLORA[0].id, 'plot-the-moon': FLORA[1].id };
    const once = normalizeGarden(garden, MAX_LEVEL);
    expect(normalizeGarden(once, MAX_LEVEL)).toEqual(once);
  });
});

describe('what the garden is asking for', () => {
  it('is every plot at first, and none once they are all planted', () => {
    expect(emptyPlots({}, MAX_LEVEL)).toHaveLength(PLOTS.length);
    const full = Object.fromEntries(PLOTS.map((p, i) => [p.id, FLORA[i % FLORA.length].id]));
    expect(emptyPlots(full, MAX_LEVEL)).toEqual([]);
  });

  it('never counts ground nobody has reached', () => {
    expect(emptyPlots({}, 1)).toEqual([]);
    expect(emptyPlots({}, 2)).toHaveLength(1);
  });
});
