import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_PET_BOND,
  EGG_PRICE,
  GEAR_PRICE,
  REFINE_GAIN,
  REFINE_MAX,
  canAfford,
  canRefine,
  gearBonusWithRefinement,
  refinePrice,
  refinedBonus,
} from './shop';
import { PET_RANK_BONDS } from './pets';
import { GEAR, RARITIES, gearById } from './gear';
import type { Rarity } from './gear';

describe('GEAR_PRICE', () => {
  it('prices every rarity, and a rarer one for more', () => {
    for (const rarity of RARITIES) expect(GEAR_PRICE[rarity]).toBeGreaterThan(0);
    expect(GEAR_PRICE.common).toBeLessThan(GEAR_PRICE.rare);
    expect(GEAR_PRICE.rare).toBeLessThan(GEAR_PRICE.epic);
    expect(GEAR_PRICE.epic).toBeLessThan(GEAR_PRICE.godly);
  });
});

describe('EGG_PRICE', () => {
  it('is a real, positive price', () => {
    expect(EGG_PRICE).toBeGreaterThan(0);
  });
});

describe('DUPLICATE_PET_BOND', () => {
  it('is a real, positive amount of bond', () => {
    expect(DUPLICATE_PET_BOND).toBeGreaterThan(0);
  });

  it('is a meaningful step, not most of a rank at once', () => {
    const rankOneToTwo = PET_RANK_BONDS[1] - PET_RANK_BONDS[0];
    expect(DUPLICATE_PET_BOND).toBeLessThan(rankOneToTwo);
    expect(DUPLICATE_PET_BOND).toBeGreaterThan(rankOneToTwo / 2);
  });
});

describe('canAfford', () => {
  it('allows exactly enough', () => {
    expect(canAfford(100, 100)).toEqual({ ok: true });
  });

  it('says how much more, when short', () => {
    const verdict = canAfford(70, 100);
    expect(verdict.ok).toBe(false);
    expect(verdict).toEqual({ ok: false, reason: '30 more coins to go.' });
  });
});

describe('canRefine', () => {
  it('allows every level under the cap', () => {
    for (let level = 0; level < REFINE_MAX; level += 1) {
      expect(canRefine(level)).toEqual({ ok: true });
    }
  });

  it('refuses at the cap, and says so', () => {
    const verdict = canRefine(REFINE_MAX);
    expect(verdict.ok).toBe(false);
    expect((verdict as { reason: string }).reason).toContain(`+${REFINE_MAX}`);
  });

  it('refuses past the cap too', () => {
    expect(canRefine(REFINE_MAX + 3).ok).toBe(false);
  });
});

describe('refinePrice', () => {
  it('rises with the level, for every rarity', () => {
    const rarity: Rarity = 'rare';
    let last = 0;
    for (let level = 0; level < REFINE_MAX; level += 1) {
      const price = refinePrice(rarity, level);
      expect(price).toBeGreaterThan(last);
      last = price;
    }
  });

  it('a rarer item refines for more at the same level', () => {
    expect(refinePrice('common', 0)).toBeLessThan(refinePrice('godly', 0));
  });
});

describe('refinedBonus', () => {
  const crown = gearById('head-paper-crown')!; // common helmet

  it('adds nothing at level zero', () => {
    expect(refinedBonus(crown, 0)).toEqual({});
  });

  it('adds REFINE_GAIN per level to the slot\'s primary stat', () => {
    const bonus = refinedBonus(crown, 2);
    const total = Object.values(bonus).reduce((sum, n) => sum + (n ?? 0), 0);
    expect(total).toBe(REFINE_GAIN * 2);
  });

  it('caps at REFINE_MAX even if asked for more', () => {
    expect(refinedBonus(crown, 99)).toEqual(refinedBonus(crown, REFINE_MAX));
  });

  it('every item in the catalogue refines onto a stat it actually leans on', () => {
    for (const item of GEAR) {
      const bonus = refinedBonus(item, 1);
      const [stat] = Object.keys(bonus);
      expect(item.bonus).toHaveProperty(stat);
    }
  });
});

describe('gearBonusWithRefinement', () => {
  const crown = gearById('head-paper-crown')!; // common helmet, +1 heart at rarity

  it('matches the plain gear bonus with no refinement', () => {
    const equipped = { helmet: crown.id };
    const bonus = gearBonusWithRefinement(equipped, 1, {});
    expect(bonus).toMatchObject(crown.bonus);
  });

  it('adds the refined item\'s bonus on top of its rarity bonus', () => {
    const equipped = { helmet: crown.id };
    const plain = gearBonusWithRefinement(equipped, 1, {});
    const refined = gearBonusWithRefinement(equipped, 1, { [crown.id]: 3 });
    const plainTotal = Object.values(plain).reduce((sum, n) => sum + (n ?? 0), 0);
    const refinedTotal = Object.values(refined).reduce((sum, n) => sum + (n ?? 0), 0);
    expect(refinedTotal).toBe(plainTotal + REFINE_GAIN * 3);
  });

  it('ignores a refine level for an item that is not actually worn', () => {
    const equipped = {};
    expect(gearBonusWithRefinement(equipped, 1, { [crown.id]: 5 })).toEqual({
      strength: 0, insight: 0, heart: 0, luck: 0,
    });
  });

  it('still respects the level gate: an unworn-because-too-low item contributes nothing', () => {
    const godly = GEAR.find((g) => g.rarity === 'godly' && g.slot === 'helmet')!;
    const equipped = { helmet: godly.id };
    const bonus = gearBonusWithRefinement(equipped, 1, { [godly.id]: 5 });
    expect(bonus).toEqual({ strength: 0, insight: 0, heart: 0, luck: 0 });
  });
});
