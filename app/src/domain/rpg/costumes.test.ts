import { describe, expect, it } from 'vitest';
import {
  COSTUMES, COSTUME_PREFIX, COSTUME_REFUND, costumeById, costumeStyle, costumesOfTier,
  isCostumeItem, pickCostume,
} from './costumes';
import { DYES } from './dyes';
import { GEAR } from './gear';
import { FURNITURE } from './furniture';
import { PURSES } from './coinSources';
import { EGG_PRICE } from './shop';
import { TIERS, tierRank } from './tiers';

describe('the costume catalogue', () => {
  it('has fifteen, with unique ids under its own prefix', () => {
    expect(COSTUMES).toHaveLength(15);
    const ids = COSTUMES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isCostumeItem(id)).toBe(true);
    expect(COSTUMES[0].id.startsWith(COSTUME_PREFIX)).toBe(true);
  });

  it('has something to bring at every tier, so no hatch can come out empty-handed', () => {
    for (const tier of TIERS) expect(costumesOfTier(tier).length, tier).toBeGreaterThan(0);
  });

  it('is plentiful at the bottom and scarce at the top', () => {
    const counts = TIERS.map((tier) => costumesOfTier(tier).length);
    expect(counts).toEqual([4, 4, 3, 2, 2]);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
  });

  it('shares no id with a dye, a piece of gear, furniture or a purse', () => {
    const others = new Set<string>([
      ...DYES.map((d) => d.id), ...GEAR.map((g) => g.id),
      ...FURNITURE.map((f) => f.id), ...PURSES.map((p) => p.id),
    ]);
    for (const costume of COSTUMES) expect(others.has(costume.id), costume.id).toBe(false);
  });

  it('never uses a dye\'s own colours, so the two cannot be mistaken for each other', () => {
    const dyeColours = new Set(DYES.flatMap((d) => [d.ink, d.accent, d.muted].map((c) => c.toLowerCase())));
    for (const costume of COSTUMES) {
      expect(dyeColours.has(costume.main.toLowerCase()), costume.id).toBe(false);
    }
  });

  it('has a distinct name and blurb for each', () => {
    expect(new Set(COSTUMES.map((c) => c.name)).size).toBe(COSTUMES.length);
    expect(new Set(COSTUMES.map((c) => c.blurb)).size).toBe(COSTUMES.length);
  });

  it('looks a costume up, and is total for one that is not there', () => {
    expect(costumeById(COSTUMES[0].id)).toBe(COSTUMES[0]);
    expect(costumeById('nope')).toBeUndefined();
    expect(costumeById(undefined)).toBeUndefined();
  });

  it('styles through its own two properties and none of the dye\'s', () => {
    const style = costumeStyle(COSTUMES[0].id);
    expect(Object.keys(style).sort()).toEqual(['--costume-main', '--costume-trim']);
    expect(costumeStyle(undefined)).toEqual({});
  });
});

describe('what a repeat refunds', () => {
  it('rises with the tier and is never nothing', () => {
    const values = TIERS.map((tier) => COSTUME_REFUND[tier]);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(Math.min(...values)).toBeGreaterThan(0);
  });

  it('stays under an egg\'s price, so hatching can never pay for itself', () => {
    for (const tier of TIERS) expect(COSTUME_REFUND[tier], tier).toBeLessThan(EGG_PRICE);
  });
});

describe('picking the costume a hatch brings', () => {
  it('always comes from the companion\'s own tier', () => {
    for (const tier of TIERS) {
      for (const roll of [0, 0.3, 0.7, 0.999]) {
        expect(pickCostume(tier, roll, new Set()).costume.tier).toBe(tier);
      }
    }
  });

  it('is the same pick for the same roll', () => {
    const a = pickCostume('rare', 0.4, new Set());
    expect(pickCostume('rare', 0.4, new Set()).costume.id).toBe(a.costume.id);
  });

  it('prefers one you do not have, however the roll falls', () => {
    const commons = costumesOfTier('common');
    const owned = new Set(commons.slice(0, commons.length - 1).map((c) => c.id));
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const pick = pickCostume('common', roll, owned);
      expect(pick.costume.id).toBe(commons[commons.length - 1].id);
      expect(pick.duplicate).toBe(false);
    }
  });

  it('is a duplicate only when every costume at the tier is already yours', () => {
    const owned = new Set(costumesOfTier('mythic').map((c) => c.id));
    expect(pickCostume('mythic', 0.5, owned).duplicate).toBe(true);
    expect(pickCostume('mythic', 0.5, new Set()).duplicate).toBe(false);
  });

  it('reaches every costume at a tier across the roll, so none is unfindable', () => {
    for (const tier of TIERS) {
      const seen = new Set<string>();
      for (let i = 0; i < 100; i += 1) seen.add(pickCostume(tier, i / 100, new Set()).costume.id);
      expect(seen.size, tier).toBe(costumesOfTier(tier).length);
    }
  });

  it('puts the rarest things to wear on the highest rungs', () => {
    expect(tierRank(COSTUMES[COSTUMES.length - 1].tier)).toBe(tierRank('mythic'));
  });
});
