import { describe, expect, it } from 'vitest';
import {
  activeFilterCount, companionFacets, companionRows, filterCompanions, type CompanionRow,
} from './companionStats';
import { companionSource } from './loadout';
import { PET_KINDS, PET_RANK_BONDS, type PetInstance } from './pets';
import { RAID_STATS, SPECIES_RAID_ORDER, raidSheet } from './raidStats';

let n = 0;
function pet(kindId: string, bond = 0, hatchedAt = 1000 + n): PetInstance {
  n += 1;
  return {
    id: `p${n}-${kindId}`, coupleId: 'c', memberId: 'm', kindId, bond, mp: 0, hatchedAt, updatedAt: hatchedAt,
  };
}

const OWNED = [
  pet('horse-common', 0, 100),
  pet('cat-rare', 25, 200),
  pet('fairy-epic', 70, 300),
  pet('vampire-godly', 300, 400),
  pet('horse-mythic', 150, 500),
];

describe('companionRows', () => {
  const rows = companionRows(OWNED, OWNED[1].id);

  it('makes one row per companion', () => {
    expect(rows).toHaveLength(OWNED.length);
  });

  /** The list and the fight must agree about what a companion is worth. */
  it('reads the same numbers the raid sheet does', () => {
    for (const row of rows) {
      const sheet = raidSheet([companionSource(row.pet)!]);
      expect(row.stats).toEqual(sheet.total);
    }
  });

  it('names the stat a companion is built around', () => {
    for (const row of rows) {
      expect(row.primary).toBe(SPECIES_RAID_ORDER[row.species][0]);
    }
  });

  it('marks only the walking companion', () => {
    expect(rows.filter((r) => r.active).map((r) => r.pet.id)).toEqual([OWNED[1].id]);
  });

  it('measures bond progress within the current rank', () => {
    const cat = rows.find((r) => r.kind.id === 'cat-rare')!;
    expect(cat.rank).toBe(2); // bond 25 is past the 20 that opens rank 2
    expect(cat.toNextRank).toBe(PET_RANK_BONDS[2] - 25);
    expect(cat.rankProgress).toBeCloseTo((25 - 20) / (60 - 20));
  });

  it('is full at the top rank', () => {
    const top = rows.find((r) => r.kind.id === 'vampire-godly')!;
    expect(top.maxed).toBe(true);
    expect(top.toNextRank).toBeNull();
    expect(top.rankProgress).toBe(1);
  });

  it('has no passive on a common, and one on everything above', () => {
    expect(rows.find((r) => r.tier === 'common')!.passivePercent).toBe(0);
    for (const row of rows.filter((r) => r.tier !== 'common')) {
      expect(row.passivePercent).toBeGreaterThan(0);
    }
  });

  it('says whether a skill is unlocked at the companion\'s rank', () => {
    const mythic = rows.find((r) => r.kind.id === 'horse-mythic')!;
    expect(mythic.skill.unlocked).toBe(mythic.rank >= mythic.skill.minRank);
  });

  /** One stored row it cannot name must not take the list down. */
  it('skips a companion whose kind is gone', () => {
    const ghost = pet('unicorn-secret');
    expect(companionRows([ghost, OWNED[0]], undefined)).toHaveLength(1);
  });

  it('covers every kind in the catalogue without throwing', () => {
    const all = PET_KINDS.map((k) => pet(k.id));
    expect(companionRows(all, undefined)).toHaveLength(PET_KINDS.length);
    for (const row of companionRows(all, undefined)) {
      expect(RAID_STATS.some((key) => row.stats[key] > 0)).toBe(true);
    }
  });
});

describe('filterCompanions', () => {
  const rows = companionRows(OWNED, OWNED[1].id);
  const ids = (list: CompanionRow[]) => list.map((r) => r.kind.id);

  it('returns everything, in rank order, with no filter', () => {
    const out = filterCompanions(rows, {});
    expect(out).toHaveLength(rows.length);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i - 1].rank).toBeGreaterThanOrEqual(out[i].rank);
    }
  });

  it('filters by one or more tiers', () => {
    expect(ids(filterCompanions(rows, { tiers: ['mythic'] }))).toEqual(['horse-mythic']);
    expect(filterCompanions(rows, { tiers: ['common', 'rare'] })).toHaveLength(2);
  });

  it('filters by species', () => {
    expect(ids(filterCompanions(rows, { species: 'horse' })).sort())
      .toEqual(['horse-common', 'horse-mythic']);
  });

  it('filters by a stat the companion actually gives', () => {
    for (const key of RAID_STATS) {
      for (const row of filterCompanions(rows, { stat: key })) {
        expect(row.stats[key]).toBeGreaterThan(0);
      }
    }
  });

  it('filters by what the skill does', () => {
    for (const row of filterCompanions(rows, { skill: 'damage' })) {
      expect(row.skill.kinds).toContain('damage');
    }
  });

  it('finds the walking companion, and the maxed ones', () => {
    expect(ids(filterCompanions(rows, { walkingOnly: true }))).toEqual(['cat-rare']);
    expect(ids(filterCompanions(rows, { maxedOnly: true }))).toEqual(['vampire-godly']);
  });

  it('combines filters with AND', () => {
    expect(filterCompanions(rows, { tiers: ['mythic'], species: 'cat' })).toEqual([]);
  });

  it('sorts by tier, highest first, even when a lucky roll says otherwise', () => {
    const out = filterCompanions(rows, { sort: 'tier' });
    expect(out[0].tier).toBe('mythic');
    expect(out[out.length - 1].tier).toBe('common');
  });

  it('sorts by a chosen stat, highest first', () => {
    const out = filterCompanions(rows, { sort: 'resilience' });
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i - 1].stats.resilience).toBeGreaterThanOrEqual(out[i].stats.resilience);
    }
  });

  it('sorts by name and by newest', () => {
    const named = filterCompanions(rows, { sort: 'name' }).map((r) => r.kind.name);
    expect(named).toEqual([...named].sort((a, b) => a.localeCompare(b)));
    expect(filterCompanions(rows, { sort: 'newest' })[0].kind.id).toBe('horse-mythic');
  });

  /** Two phones must show the same order for companions that tie. */
  it('breaks ties the same way every time', () => {
    const twins = companionRows([pet('cat-rare', 5, 50), pet('cat-rare', 5, 50)], undefined);
    const a = filterCompanions(twins, { sort: 'bond' }).map((r) => r.pet.id);
    const b = filterCompanions([...twins].reverse(), { sort: 'bond' }).map((r) => r.pet.id);
    expect(a).toEqual(b);
  });

  it('does not change the rows it was given', () => {
    const before = rows.map((r) => r.pet.id);
    filterCompanions(rows, { sort: 'name' });
    expect(rows.map((r) => r.pet.id)).toEqual(before);
  });
});

describe('activeFilterCount', () => {
  it('counts each narrowing filter once, and ignores the sort', () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ sort: 'name' })).toBe(0);
    expect(activeFilterCount({ tiers: ['rare', 'epic'], species: 'cat', walkingOnly: true })).toBe(3);
    expect(activeFilterCount({ tiers: [] })).toBe(0);
  });
});

describe('companionFacets', () => {
  const rows = companionRows(OWNED, undefined);
  const facets = companionFacets(rows);

  it('offers only tiers that are owned, highest first', () => {
    expect(facets.tiers).toEqual(['mythic', 'legendary', 'epic', 'rare', 'common']);
    expect(companionFacets(rows.filter((r) => r.tier === 'rare')).tiers).toEqual(['rare']);
  });

  it('offers only stats something gives', () => {
    for (const key of facets.stats) {
      expect(rows.some((r) => r.stats[key] > 0)).toBe(true);
    }
  });

  it('is empty for nothing owned', () => {
    expect(companionFacets([])).toEqual({ tiers: [], species: [], stats: [], skills: [] });
  });
});
