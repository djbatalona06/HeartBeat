import { describe, expect, it } from 'vitest';
import {
  GEAR,
  LEGACY_SLOT_KEYS,
  RARITIES,
  RARITY_BUDGET,
  bonusFor,
  canEquip,
  equip,
  gearBonus,
  gearById,
  gearForSlot,
  needsGearMigration,
  normalizeGear,
  unequip,
} from './gear';
import { statsFor } from './avatar';
import { GEAR_SLOTS, type GearSlot, type StatKey } from './types';

const STAT_KEYS: StatKey[] = ['strength', 'insight', 'heart', 'luck'];

/** What a whole item is worth, added up across the four stats. */
function worth(bonus: Partial<Record<StatKey, number>>): number {
  return STAT_KEYS.reduce((sum, k) => sum + (bonus[k] ?? 0), 0);
}

/** How many different stats an item touches — the part rarity widens. */
function spread(bonus: Partial<Record<StatKey, number>>): number {
  return STAT_KEYS.filter((k) => (bonus[k] ?? 0) > 0).length;
}

describe('the gear catalogue', () => {
  it('has a unique id for every item', () => {
    const ids = GEAR.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fills all five slots at all four rarities', () => {
    expect(GEAR).toHaveLength(GEAR_SLOTS.length * RARITIES.length);
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
        expect(worth(byLevel[i].bonus), slot).toBeGreaterThan(worth(byLevel[i - 1].bonus));
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

/**
 * Rarity has to mean two things at once, or it is just a colour. A rarer item
 * is worth more *and* touches more stats — the second is what makes a godly
 * drop feel different in kind rather than merely larger.
 */
describe('rarity', () => {
  it('is worth more the rarer it gets, in every slot', () => {
    for (const slot of GEAR_SLOTS) {
      for (let i = 1; i < RARITIES.length; i += 1) {
        expect(worth(bonusFor(slot, RARITIES[i])), `${slot} ${RARITIES[i]}`)
          .toBeGreaterThan(worth(bonusFor(slot, RARITIES[i - 1])));
      }
    }
  });

  it('touches one more stat at each step up', () => {
    for (const slot of GEAR_SLOTS) {
      for (let i = 0; i < RARITIES.length; i += 1) {
        expect(spread(bonusFor(slot, RARITIES[i])), `${slot} ${RARITIES[i]}`).toBe(i + 1);
      }
    }
  });

  it('spends exactly the budget it is given', () => {
    for (const slot of GEAR_SLOTS) {
      for (const rarity of RARITIES) {
        const budget = RARITY_BUDGET[rarity].reduce((a, b) => a + b, 0);
        expect(worth(bonusFor(slot, rarity)), `${slot} ${rarity}`).toBe(budget);
      }
    }
  });

  it('leads each slot with the stat that slot is about', () => {
    // A common item spends its single point on the slot's first stat, which is
    // the cheapest way to pin that helmets are insight and weapons are strength.
    expect(bonusFor('helmet', 'common')).toEqual({ insight: 1 });
    expect(bonusFor('chestplate', 'common')).toEqual({ heart: 1 });
    expect(bonusFor('boots', 'common')).toEqual({ heart: 1 });
    expect(bonusFor('amulet', 'common')).toEqual({ luck: 1 });
    expect(bonusFor('weapon', 'common')).toEqual({ strength: 1 });
  });
});

describe('gearBonus', () => {
  const full: Partial<Record<GearSlot, string>> = {
    helmet: 'head-ribbon',
    chestplate: 'body-lily-shawl',
    weapon: 'weapon-ember-brand',
    amulet: 'charm-pressed-lily',
  };

  it('sums the worn set', () => {
    const bonus = gearBonus(full, 10);
    const worn = Object.values(full).flatMap((id) => (id ? [gearById(id)!.bonus] : []));
    const expected = Object.fromEntries(
      STAT_KEYS.map((k) => [k, worn.reduce((sum, b) => sum + (b[k] ?? 0), 0)]),
    );
    expect(bonus).toEqual(expected);
  });

  it('is nothing at all when nothing is worn', () => {
    expect(gearBonus({}, 10)).toEqual({ strength: 0, insight: 0, heart: 0, luck: 0 });
  });

  /** A corrupt row should dim the sheet, not break the page. */
  it('ignores an item above its level gate rather than throwing', () => {
    expect(gearBonus({ helmet: 'head-aurora-veil' }, 2))
      .toEqual({ strength: 0, insight: 0, heart: 0, luck: 0 });
  });

  it('ignores an unknown id and an item filed in the wrong slot', () => {
    expect(gearBonus({ helmet: 'nope' }, 50).insight).toBe(0);
    expect(gearBonus({ helmet: 'weapon-ember-brand' }, 50).strength).toBe(0);
  });

  it('lands on the sheet on top of the level stats', () => {
    const bare = statsFor(10);
    const dressed = statsFor(10, gearBonus(full, 10));
    const bonus = gearBonus(full, 10);
    expect(dressed.strength).toBe(bare.strength + bonus.strength!);
    expect(dressed.luck).toBe(bare.luck + bonus.luck!);
  });
});

/**
 * The slots were renamed — head, body and charm became helmet, chestplate and
 * amulet — and avatars already stored on two phones still carry the old keys.
 *
 * This is the part of the rename that could quietly cost someone their gear:
 * `gearBonus` skips any item whose slot does not match the key it was filed
 * under, so a bare rename would have emptied every wardrobe with no error
 * anywhere. Item ids deliberately did not change, so the old value is still a
 * real item — only the key it hangs on had to move.
 */
describe('the slot rename', () => {
  it('reads an old row as the new slot', () => {
    expect(normalizeGear({ head: 'head-ribbon' })).toEqual({ helmet: 'head-ribbon' });
    expect(normalizeGear({ body: 'body-lily-shawl' })).toEqual({ chestplate: 'body-lily-shawl' });
    expect(normalizeGear({ charm: 'charm-north-star' })).toEqual({ amulet: 'charm-north-star' });
  });

  it('covers every renamed key and no others', () => {
    expect(Object.keys(LEGACY_SLOT_KEYS).sort()).toEqual(['body', 'charm', 'head']);
    for (const slot of Object.values(LEGACY_SLOT_KEYS)) {
      expect(GEAR_SLOTS).toContain(slot);
    }
  });

  /** The load-bearing one: nobody loses a stat by having logged in earlier. */
  it('pays an old row exactly what the new row would pay', () => {
    const old = { head: 'head-ribbon', body: 'body-lily-shawl', charm: 'charm-pressed-lily' };
    const migrated = {
      helmet: 'head-ribbon',
      chestplate: 'body-lily-shawl',
      amulet: 'charm-pressed-lily',
    };
    expect(gearBonus(old, 10)).toEqual(gearBonus(migrated, 10));
    expect(worth(gearBonus(old, 10))).toBeGreaterThan(0);
  });

  it('leaves weapon alone, since that slot kept its name', () => {
    expect(normalizeGear({ weapon: 'weapon-ember-brand' }))
      .toEqual({ weapon: 'weapon-ember-brand' });
  });

  it('prefers the new key when a row somehow carries both', () => {
    expect(normalizeGear({ head: 'head-paper-crown', helmet: 'head-ribbon' }))
      .toEqual({ helmet: 'head-ribbon' });
  });

  it('drops empty slots rather than carrying undefined across', () => {
    expect(normalizeGear({ head: undefined, weapon: 'weapon-ember-brand' }))
      .toEqual({ weapon: 'weapon-ember-brand' });
  });

  it('knows which rows still need moving, so healing them is not guesswork', () => {
    expect(needsGearMigration({ head: 'head-ribbon' })).toBe(true);
    expect(needsGearMigration({ helmet: 'head-ribbon' })).toBe(false);
    expect(needsGearMigration({})).toBe(false);
  });

  it('heals the row the first time its owner touches the wardrobe', () => {
    const result = equip({ head: 'head-paper-crown' }, 'weapon-ember-brand', 10);
    expect(result.ok && result.equipped)
      .toEqual({ helmet: 'head-paper-crown', weapon: 'weapon-ember-brand' });
  });

  it('heals on the way out too, so taking something off does not strand a key', () => {
    expect(unequip({ head: 'head-ribbon', weapon: 'weapon-ember-brand' }, 'weapon'))
      .toEqual({ helmet: 'head-ribbon' });
  });
});

describe('equip', () => {
  it('puts an item in its own slot', () => {
    const result = equip({}, 'weapon-ember-brand', 10);
    expect(result.ok && result.equipped.weapon).toBe('weapon-ember-brand');
  });

  it('puts boots on, the slot that did not exist before', () => {
    const boots = gearForSlot('boots')[0];
    const result = equip({}, boots.id, 1);
    expect(result.ok && result.equipped.boots).toBe(boots.id);
  });

  it('replaces whatever was in that slot without touching the others', () => {
    const first = equip({ helmet: 'head-paper-crown' }, 'head-ribbon', 10);
    expect(first.ok && first.equipped).toEqual({ helmet: 'head-ribbon' });
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
    expect(unequip({ helmet: 'head-ribbon', amulet: 'charm-north-star' }, 'helmet'))
      .toEqual({ amulet: 'charm-north-star' });
  });

  it('agrees with canEquip', () => {
    const veil = gearById('head-aurora-veil')!;
    expect(canEquip(veil, 15)).toBe(false);
    expect(canEquip(veil, 16)).toBe(true);
  });
});
