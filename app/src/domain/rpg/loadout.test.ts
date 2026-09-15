import { describe, expect, it } from 'vitest';
import {
  COMPANION_RANK_LIFT, PET_LEVEL_STAT_STEP, companionSource, dyeSource, furnitureSources,
  gearSources, loadoutSheet, petSource,
} from './loadout';
import { RAID_STATS, type RaidStatKey } from './raidStats';
import { GEAR } from './gear';
import { FURNITURE } from './furniture';
import { DYES } from './dyes';
import { PET_KINDS, PET_RANK_BONDS, type PetInstance } from './pets';
import { TIER_STAT_LEVELS } from './tiers';

const pet = (kindId: string, bond = 0): PetInstance => ({
  id: 'p1', coupleId: 'c', memberId: 'm', kindId, bond, mp: 0,
  hatchedAt: 0, updatedAt: 0,
});

const sum = (stats: Partial<Record<RaidStatKey, number>>) =>
  RAID_STATS.reduce((total, key) => total + (stats[key] ?? 0), 0);

/**
 * The rule the whole layer exists to enforce, asserted over the real
 * catalogues rather than over a fixture. If somebody adds a cushion with no
 * stat behind it, this is what says so.
 */
describe('nothing is only decoration', () => {
  it('gives every piece of gear a stat level and a rung', () => {
    for (const item of GEAR) {
      const band = TIER_STAT_LEVELS[item.rarity];
      expect(item.statLevel, item.id).toBeGreaterThanOrEqual(band.min);
      expect(item.statLevel, item.id).toBeLessThanOrEqual(band.max);
      expect(item.passive, item.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every piece of furniture something, wherever it is placed', () => {
    for (const piece of FURNITURE) {
      const sources = furnitureSources({ [piece.slot]: piece.id });
      expect(sources, piece.id).toHaveLength(1);
      expect(sum(sources[0].order.length ? { [sources[0].order[0]]: 1 } : {})).toBe(1);
      expect(sources[0].statLevel, piece.id).toBeGreaterThan(0);
    }
  });

  it('gives every dye something, the free one included', () => {
    for (const dye of DYES) {
      const source = dyeSource(dye.id);
      expect(source, dye.id).toBeDefined();
      expect(source!.statLevel, dye.id).toBeGreaterThan(0);
    }
  });

  it('gives every companion kind something', () => {
    for (const kind of PET_KINDS) {
      const source = companionSource(pet(kind.id));
      expect(source, kind.id).toBeDefined();
      expect(source!.statLevel, kind.id).toBeGreaterThan(0);
      expect(source!.tier, kind.id).toBe(kind.rarity);
    }
  });
});

describe('worn gear', () => {
  const helmet = GEAR.find((g) => g.slot === 'helmet' && g.rarity === 'common')!;
  const mythicWeapon = GEAR.find((g) => g.slot === 'weapon' && g.rarity === 'mythic')!;

  it('contributes what is worn and nothing that is not', () => {
    expect(gearSources({ helmet: helmet.id }, 50)).toHaveLength(1);
    expect(gearSources({}, 50)).toHaveLength(0);
  });

  it('skips an item the wearer has not levelled into, rather than throwing', () => {
    expect(gearSources({ weapon: mythicWeapon.id }, 1)).toHaveLength(0);
    expect(gearSources({ weapon: mythicWeapon.id }, mythicWeapon.minLevel)).toHaveLength(1);
  });

  it('reads an old row filed under the pre-rename slot keys', () => {
    expect(gearSources({ head: helmet.id }, 50)).toHaveLength(1);
  });

  it('ignores an id that is no longer in the catalogue', () => {
    expect(gearSources({ helmet: 'head-retired-thing' }, 50)).toHaveLength(0);
  });

  /** Refinement deepens what an item does. It never hands a common a passive
   *  the tier table says commons do not have. */
  it('adds refinement to the stat level and not to the rung', () => {
    const plain = gearSources({ helmet: helmet.id }, 50)[0];
    const refined = gearSources({ helmet: helmet.id }, 50, { [helmet.id]: 5 })[0];
    expect(refined.statLevel).toBe(plain.statLevel + 5);
    expect(refined.tier).toBe('common');
  });

  it('caps refinement where the shop caps it', () => {
    const over = gearSources({ helmet: helmet.id }, 50, { [helmet.id]: 99 })[0];
    const atCap = gearSources({ helmet: helmet.id }, 50, { [helmet.id]: 5 })[0];
    expect(over.statLevel).toBe(atCap.statLevel);
  });
});

describe('the room', () => {
  it('drops a piece stored in a slot it does not belong to', () => {
    const rug = FURNITURE.find((f) => f.slot === 'floor')!;
    expect(furnitureSources({ wall: rug.id })).toHaveLength(0);
  });

  it('is empty for an empty room', () => {
    expect(furnitureSources(undefined)).toEqual([]);
    expect(furnitureSources({})).toEqual([]);
  });
});

describe('a companion', () => {
  const kind = PET_KINDS.find((k) => k.rarity === 'epic')!;

  it('is worth more at a higher rank', () => {
    const fresh = companionSource(pet(kind.id, 0))!;
    const ranked = companionSource(pet(kind.id, PET_RANK_BONDS[4]))!;
    expect(ranked.statLevel).toBeGreaterThan(fresh.statLevel);
    expect(ranked.statLevel).toBe(Math.round(fresh.statLevel * (1 + COMPANION_RANK_LIFT * 4)));
  });

  it('stays on its own rung however much bond it has', () => {
    expect(companionSource(pet(kind.id, 99_999))!.tier).toBe(kind.rarity);
  });

  it('is nothing for no companion, and for one nobody recognises', () => {
    expect(companionSource(undefined)).toBeUndefined();
    expect(companionSource(pet('dragon-mythic'))).toBeUndefined();
  });
});

describe('the shared pet', () => {
  it('scales straight off its level', () => {
    expect(petSource(10).statLevel).toBe(10 * PET_LEVEL_STAT_STEP);
    expect(petSource(50).statLevel).toBe(50 * PET_LEVEL_STAT_STEP);
  });

  it('is never nothing, even at level zero', () => {
    expect(petSource(0).statLevel).toBeGreaterThan(0);
    expect(petSource(-4).statLevel).toBeGreaterThan(0);
  });

  it('climbs the same rungs everything else does', () => {
    expect(petSource(1).tier).toBe('common');
    expect(petSource(5).tier).toBe('epic');
    expect(petSource(10).tier).toBe('legendary');
    expect(petSource(20).tier).toBe('mythic');
  });

  /** The plan's headline, as arithmetic: gear feeds the pet's power, and the
   *  pet's own level is the biggest line on the sheet. */
  it('outweighs a full set of mythic gear by the top of the curve', () => {
    const mythicSet = GEAR.filter((g) => g.rarity === 'mythic');
    const gearTotal = mythicSet.reduce((total, g) => total + g.statLevel, 0);
    expect(petSource(50).statLevel * 5).toBeGreaterThan(gearTotal);
  });
});

describe('the whole sheet', () => {
  it('works with nothing owned but a pet', () => {
    const sheet = loadoutSheet({ petLevel: 1, memberLevel: 1 });
    expect(sheet.sources).toHaveLength(1);
    expect(sum(sheet.total)).toBeGreaterThan(0);
  });

  it('counts each thing exactly once', () => {
    const helmet = GEAR.find((g) => g.slot === 'helmet' && g.rarity === 'common')!;
    const rug = FURNITURE.find((f) => f.slot === 'floor')!;
    const sheet = loadoutSheet({
      petLevel: 12,
      memberLevel: 30,
      equipped: { helmet: helmet.id },
      house: { floor: rug.id },
      dyeId: DYES[1].id,
      companion: pet(PET_KINDS[0].id),
    });
    // Level 12 has crossed the level-10 milestone, so the curve's own grant is
    // a source too — it appears on the sheet's provenance list like everything
    // else rather than being quietly added to the totals.
    expect(sheet.sources.map((s) => s.id)).toEqual([
      'shared-pet', helmet.id, rug.id, 'milestones', DYES[1].id, PET_KINDS[0].id,
    ]);
  });

  it('only ever grows as a couple owns more', () => {
    const bare = loadoutSheet({ petLevel: 20, memberLevel: 30 });
    const kitted = loadoutSheet({
      petLevel: 20,
      memberLevel: 30,
      equipped: Object.fromEntries(
        GEAR.filter((g) => g.rarity === 'mythic').map((g) => [g.slot, g.id]),
      ),
      house: Object.fromEntries(FURNITURE.slice(0, 4).map((f) => [f.slot, f.id])),
      dyeId: DYES[2].id,
      companion: pet('cat-mythic', 9999),
    });
    for (const key of RAID_STATS) {
      expect(kitted.total[key], key).toBeGreaterThanOrEqual(bare.total[key]);
    }
    expect(sum(kitted.total)).toBeGreaterThan(sum(bare.total));
  });
});
