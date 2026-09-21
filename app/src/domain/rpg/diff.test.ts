import { describe, expect, it } from 'vitest';
import { previewSwap } from './diff';
import { GEAR } from './gear';
import { RAID_STATS } from './raidStats';
import { compareTiers } from './tiers';
import type { Loadout } from './loadout';
import type { GearSlot } from './types';

const bare = (over: Partial<Loadout> = {}): Loadout => ({
  petLevel: 10,
  memberLevel: 50,
  ...over,
});

/** The cheapest and the dearest item in one slot, so a swap has somewhere to
 *  go in both directions. */
function ladder(slot: GearSlot) {
  const inSlot = GEAR.filter((item) => item.slot === slot)
    .sort((a, b) => compareTiers(a.rarity, b.rarity));
  return { worst: inSlot[0], best: inSlot[inSlot.length - 1] };
}

const SLOT: GearSlot = GEAR[0].slot;

describe('previewing a swap', () => {
  it('leaves what is equipped alone', () => {
    const { best } = ladder(SLOT);
    const loadout = bare({ equipped: {} });
    previewSwap(loadout, SLOT, best.id);
    expect(loadout.equipped).toEqual({});
  });

  it('shows the sheet as it stands and the sheet with the swap', () => {
    const { best } = ladder(SLOT);
    const diff = previewSwap(bare(), SLOT, best.id);
    expect(diff.worn.sheet.total).toBeDefined();
    expect(diff.swapped.sheet.total).toBeDefined();
    expect(diff.swapped.sum).toBeGreaterThan(diff.worn.sum);
  });

  it('reports the change per stat, signed', () => {
    const { best } = ladder(SLOT);
    const diff = previewSwap(bare(), SLOT, best.id);
    for (const key of RAID_STATS) {
      expect(diff.delta[key], key)
        .toBe(diff.swapped.sheet.total[key] - diff.worn.sheet.total[key]);
    }
    expect(diff.netSum).toBe(diff.swapped.sum - diff.worn.sum);
    expect(diff.netSum).toBeGreaterThan(0);
  });

  /** Filling an empty slot is a gain; the reverse of the same swap is a loss
   *  of the same size. */
  it('is symmetric — taking the same thing off costs what putting it on gave', () => {
    const { best } = ladder(SLOT);
    const on = previewSwap(bare(), SLOT, best.id);
    const off = previewSwap(bare({ equipped: { [SLOT]: best.id } }), SLOT, undefined);
    expect(off.netSum).toBe(-on.netSum);
    // Summed rather than negated: `-0` is not `0` under Object.is, and a
    // stat neither swap touched produces exactly that.
    for (const key of RAID_STATS) {
      expect(off.delta[key] + on.delta[key], key).toBe(0);
    }
  });

  it('empties the slot when given nothing, and says so by omitting itemId', () => {
    const { best } = ladder(SLOT);
    const diff = previewSwap(bare({ equipped: { [SLOT]: best.id } }), SLOT, undefined);
    expect('itemId' in diff).toBe(false);
    expect(diff.swapped.sum).toBeLessThan(diff.worn.sum);
  });

  it('is a no-op when the swap is for what is already there', () => {
    const { best } = ladder(SLOT);
    const diff = previewSwap(bare({ equipped: { [SLOT]: best.id } }), SLOT, best.id);
    expect(diff.netSum).toBe(0);
    for (const key of RAID_STATS) expect(diff.delta[key], key).toBe(0);
  });

  it('can report a downgrade as a downgrade', () => {
    const { worst, best } = ladder(SLOT);
    if (worst.id === best.id) return;
    const diff = previewSwap(bare({ equipped: { [SLOT]: best.id } }), SLOT, worst.id);
    expect(diff.netSum).toBeLessThan(0);
  });

  it('touches only the slot it was given', () => {
    const { best } = ladder(SLOT);
    const other = GEAR.find((item) => item.slot !== SLOT)!;
    const diff = previewSwap(
      bare({ equipped: { [other.slot]: other.id } }),
      SLOT,
      best.id,
    );
    // The other slot's own sources survive the copy.
    expect(diff.swapped.sheet.sources.map((s) => s.id)).toContain(other.id);
  });
});

/**
 * The level gate is previewed, not hidden.
 *
 * `gearSources` contributes nothing for an item above its wearer's level, so a
 * swap to something out of reach shows an empty slot rather than promising
 * stats that would not arrive. "Not yet" is the honest answer and this is
 * where it is pinned.
 */
describe('an item the wearer cannot use yet', () => {
  it('previews as no gain rather than as a gain that never lands', () => {
    const gated = [...GEAR].sort((a, b) => b.minLevel - a.minLevel)[0];
    if (gated.minLevel <= 1) return;
    const diff = previewSwap(
      bare({ memberLevel: 1, equipped: {} }),
      gated.slot,
      gated.id,
    );
    expect(diff.netSum).toBe(0);
    expect(diff.swapped.sheet.sources.map((s) => s.id)).not.toContain(gated.id);
  });
});
