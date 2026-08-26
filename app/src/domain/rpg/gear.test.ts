import { describe, expect, it } from 'vitest';
import { GEAR, RARITIES, canEquip, equip, gearBonus, gearById, gearForSlot, unequip } from './gear';
import { statsFor } from './avatar';
import { GEAR_SLOTS, type GearSlot, type StatKey } from './types';

const STAT_KEYS: StatKey[] = ['strength', 'insight', 'heart', 'luck'];

describe('the gear catalogue', () => {
  it('has a unique id for every item', () => {
    const ids = GEAR.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fills all four slots at all four rarities', () => {
    for (const slot of GEAR_SLOTS) {
      const rarities = gearForSlot(slot).map((g) => g.rarity);
      expect(new Set(rarities), slot).toEqual(new Set(RARITIES));
    }
  });

  it('files every item under the slot it claims', () => {
    for (const slot of GEAR_SLOTS) {
      for (const item of gearForSlot(slot)) expect(item.slot).toBe(slot);
    }
  });

  it('gates rarer items behind higher levels', () => {
    for (const slot of GEAR_SLOTS) {
      const byLevel = gearForSlot(slot);
      for (let i = 1; i < byLevel.length; i += 1) {
        expect(byLevel[i].minLevel, slot).toBeGreaterThan(byLevel[i - 1].minLevel);
        const worth = (g: typeof byLevel[number]) =>
          STAT_KEYS.reduce((sum, k) => sum + (g.bonus[k] ?? 0), 0);
        expect(worth(byLevel[i]), slot).toBeGreaterThan(worth(byLevel[i - 1]));
      }
    }
  });

  it('starts every slot at level 1, so nobody is ever bare', () => {
    for (const slot of GEAR_SLOTS) expect(gearForSlot(slot)[0].minLevel).toBe(1);
  });

  it('gives every item a line of its own', () => {
    expect(new Set(GEAR.map((g) => g.blurb)).size).toBe(GEAR.length);
  });
});

describe('gearBonus', () => {
  const full: Partial<Record<GearSlot, string>> = {
    head: 'head-ribbon',
    body: 'body-lily-shawl',
    weapon: 'weapon-ember-brand',
    charm: 'charm-pressed-lily',
  };

  it('sums the worn set', () => {
    const bonus = gearBonus(full, 10);
    expect(bonus.strength).toBe(3);
    expect(bonus.heart).toBe(3);
    expect(bonus.insight).toBe(gearById('head-ribbon')!.bonus.insight! + 1);
  });

  it('is nothing at all when nothing is worn', () => {
    expect(gearBonus({}, 10)).toEqual({ strength: 0, insight: 0, heart: 0, luck: 0 });
  });

  /** A corrupt row should dim the sheet, not break the page. */
  it('ignores an item above its level gate rather than throwing', () => {
    expect(gearBonus({ head: 'head-aurora-veil' }, 2))
      .toEqual({ strength: 0, insight: 0, heart: 0, luck: 0 });
  });

  it('ignores an unknown id and an item filed in the wrong slot', () => {
    expect(gearBonus({ head: 'nope' }, 50).insight).toBe(0);
    expect(gearBonus({ head: 'weapon-ember-brand' }, 50).strength).toBe(0);
  });

  it('lands on the sheet on top of the level stats', () => {
    const bare = statsFor(10);
    const dressed = statsFor(10, gearBonus(full, 10));
    expect(dressed.strength).toBe(bare.strength + 3);
    expect(dressed.luck).toBe(bare.luck + 3);
  });
});

describe('equip', () => {
  it('puts an item in its own slot', () => {
    const result = equip({}, 'weapon-ember-brand', 10);
    expect(result.ok && result.equipped.weapon).toBe('weapon-ember-brand');
  });

  it('replaces whatever was in that slot without touching the others', () => {
    const first = equip({ head: 'head-paper-crown' }, 'head-ribbon', 10);
    expect(first.ok && first.equipped).toEqual({ head: 'head-ribbon' });
  });

  it('says why rather than silently refusing', () => {
    const result = equip({}, 'head-aurora-veil', 2);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('level 16');
  });

  it('rejects an id that is not gear', () => {
    expect(equip({}, 'weapon-of-nowhere', 99).ok).toBe(false);
  });

  it('takes an item off in one tap, which is what keeps it a choice', () => {
    expect(unequip({ head: 'head-ribbon', charm: 'charm-north-star' }, 'head'))
      .toEqual({ charm: 'charm-north-star' });
  });

  it('agrees with canEquip', () => {
    const veil = gearById('head-aurora-veil')!;
    expect(canEquip(veil, 15)).toBe(false);
    expect(canEquip(veil, 16)).toBe(true);
  });
});
