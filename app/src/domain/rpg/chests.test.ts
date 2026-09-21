import { describe, expect, it } from 'vitest';
import {
  CHESTS, CHEST_IDS, KIND_TIERS, PRIZES_PER_CHEST, PRIZE_KINDS, PRIZE_KIND_NAMES,
  chestById, chestChances,
  chestPityFloor, insuredTiers, kindChances, nextChestPity, openChest, pityLine, poolOf,
  rollChestTier, rollPrizeKind, showcaseOrder, type Chest,
} from './chests';
import { TIERS, compareTiers, tierRank, type Tier } from './tiers';
import { GEAR_PRICE } from './shop';

const chest = (id: string): Chest => CHESTS.find((c) => c.id === id)!;

/** A small deterministic sequence, so a distribution test replays. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('the three chests', () => {
  it('is exactly the three, each with a name and a price', () => {
    expect(CHESTS.map((c) => c.id)).toEqual([...CHEST_IDS]);
    for (const c of CHESTS) {
      expect(c.name, c.id).toBeTruthy();
      expect(c.blurb.length, c.id).toBeGreaterThan(20);
      expect(c.price, c.id).toBeGreaterThan(0);
    }
  });

  it('gets dearer as it gets better, and the pools climb with the prices', () => {
    for (let i = 1; i < CHESTS.length; i += 1) {
      expect(CHESTS[i].price).toBeGreaterThan(CHESTS[i - 1].price);
      const best = (c: Chest) => tierRank(poolOf(c)[poolOf(c).length - 1]);
      expect(best(CHESTS[i])).toBeGreaterThan(best(CHESTS[i - 1]));
    }
  });

  it('maps to the tier table the plan wrote down', () => {
    expect(poolOf(chest('wooden'))).toEqual(['common', 'rare']);
    expect(poolOf(chest('silver'))).toEqual(['rare', 'epic']);
    expect(poolOf(chest('gilded'))).toEqual(['epic', 'legendary', 'mythic']);
  });

  it('weighs each pool to one', () => {
    for (const c of CHESTS) {
      const total = poolOf(c).reduce((sum, tier) => sum + (c.weights[tier] ?? 0), 0);
      expect(total, c.id).toBeCloseTo(1, 10);
    }
  });

  it('finds one by id, and nothing for a name nobody uses', () => {
    expect(chestById('silver')!.name).toBe('Silver Chest');
    expect(chestById('platinum')).toBeUndefined();
    expect(chestById(undefined)).toBeUndefined();
  });

  it('prices each chest against the rungs it can actually reach', () => {
    for (const c of CHESTS) {
      const floorPrice = GEAR_PRICE[poolOf(c)[0]];
      expect(c.price, c.id).toBeGreaterThanOrEqual(floorPrice);
    }
  });
});

/** How likely one item is to land under its chest's floor. */
function missChance(c: Chest): number {
  return poolOf(c)
    .filter((tier) => tierRank(tier) < tierRank(c.pityTier))
    .reduce((sum, tier) => sum + (c.weights[tier] ?? 0), 0);
}

describe('pity windows', () => {
  it('guarantees something that chest can actually produce', () => {
    for (const c of CHESTS) {
      expect(poolOf(c), c.id).toContain(c.pityTier);
      expect(insuredTiers(c).length, c.id).toBeGreaterThan(0);
    }
  });

  it('widens with the chest, exactly as the plan asks', () => {
    for (let i = 1; i < CHESTS.length; i += 1) {
      expect(CHESTS[i].pityAt).toBeGreaterThan(CHESTS[i - 1].pityAt);
    }
  });

  /**
   * The honest-pity property, stated as arithmetic — and the one thing three
   * items per chest genuinely changed.
   *
   * The original claim was that a window is reached between one run in four and
   * one in twenty: rarer than that and it is decoration, more often and it is
   * the real drop rate wearing a second name.
   *
   * The counter steps once per chest that paid out nothing, and a chest pays
   * out nothing only when **all three** of its items miss. So reaching a window
   * costs `miss ** (PRIZES_PER_CHEST * pityAt)` rather than `miss ** pityAt`:
   *
   * | chest  | pityAt | one item | as shipped |
   * |--------|--------|----------|------------|
   * | wooden | 6      | 1 in 4   | 1 in 56    |
   * | silver | 9      | 1 in 6   | 1 in 212   |
   * | gilded | 12     | 1 in 15  | 1 in 3081  |
   *
   * 6/9/12 are published numbers and were kept deliberately. The consequence is
   * that the floors are a backstop which fires rarely rather than one which
   * fires — defensible, because three items is itself the protection against a
   * bad run and the floor is what catches the runs three items did not, but a
   * decision and not an accident. Restoring the old reach would mean windows of
   * about 6/8/7, which breaks `pityAt` widening with the chest.
   *
   * So the half of the property that still holds is asserted as it was, and the
   * other half is replaced by the claim that is actually true of the shipped
   * system: the thing a floor promises is something its chest reaches by luck
   * roughly half the time, which is *why* the floor rarely has to step in.
   */
  it('is never simply the real drop rate wearing a second name', () => {
    for (const c of CHESTS) {
      const reached = missChance(c) ** (PRIZES_PER_CHEST * c.pityAt);
      expect(reached, `${c.id} reaches its floor ${(reached * 100).toFixed(2)}% of runs`)
        .toBeLessThan(0.3);
    }
  });

  it('promises a tier its own chest reaches by luck about half the time', () => {
    for (const c of CHESTS) {
      const byLuck = 1 - missChance(c) ** PRIZES_PER_CHEST;
      expect(byLuck, `${c.id} pays out on its own ${(byLuck * 100).toFixed(1)}% of chests`)
        .toBeGreaterThan(0.3);
    }
  });

  /**
   * The tripwire.
   *
   * These three numbers are the whole argument above, as figures. Change
   * `PRIZES_PER_CHEST`, a chest's weights or a `pityAt` and this fails — which
   * is the point: every one of those moves how reachable a *published*
   * guarantee is, and none of them should move it by accident.
   */
  it('reaches each floor about as often as it is written down as doing', () => {
    const odds = CHESTS.map((c) => Math.round(1 / missChance(c) ** (PRIZES_PER_CHEST * c.pityAt)));
    expect(odds).toEqual([56, 212, 3081]);
  });

  it('holds off the floor until the count is reached', () => {
    const c = chest('silver');
    expect(chestPityFloor(c, 0)).toBeNull();
    expect(chestPityFloor(c, c.pityAt - 1)).toBeNull();
    expect(chestPityFloor(c, c.pityAt)).toBe(c.pityTier);
    expect(chestPityFloor(c, c.pityAt + 5)).toBe(c.pityTier);
    expect(chestPityFloor(c, -3)).toBeNull();
  });

  it('clears the counter at or above the floor, and counts up below it', () => {
    const c = chest('gilded');
    expect(nextChestPity(c, 7, 'legendary')).toBe(0);
    expect(nextChestPity(c, 7, 'mythic')).toBe(0);
    expect(nextChestPity(c, 7, 'epic')).toBe(8);
    expect(nextChestPity(c, -4, 'epic')).toBe(1);
  });

  it('keeps a counter per chest rather than one across all three', () => {
    // Nothing shared to assert against, so the property is structural: each
    // chest carries its own window and its own floor.
    expect(new Set(CHESTS.map((c) => c.pityAt)).size).toBe(CHESTS.length);
  });
});

describe('the sentence on the chest', () => {
  it('reads three different ways, and never as a lie', () => {
    const c = chest('silver');
    expect(pityLine(c, 0)).toBe(`Guaranteed Epic or better within ${c.pityAt} chests.`);
    expect(pityLine(c, 2)).toBe(`Guaranteed Epic in ${c.pityAt - 2} chests.`);
    expect(pityLine(c, c.pityAt - 1)).toBe('Guaranteed Epic in 1 chest.');
    expect(pityLine(c, c.pityAt)).toBe('Guaranteed Epic or better — this one.');
  });

  /**
   * "Draws" used to mean one item and one chest at the same time, because they
   * were the same thing. A chest holds three items now, and a counter measured
   * in items would be three times as fast as the one that is stored.
   */
  it('counts the thing it actually counts, which is chests', () => {
    expect(pityLine(chest('wooden'), 0)).toContain('chests');
    expect(pityLine(chest('wooden'), 0)).not.toContain('draws');
  });

  it('names the tier the chest is actually insured for', () => {
    expect(pityLine(chest('wooden'), 1)).toContain('Rare');
    expect(pityLine(chest('gilded'), 1)).toContain('Legendary');
  });
});

describe('odds', () => {
  it('sums to one, at every luck and on either side of the floor', () => {
    for (const c of CHESTS) {
      for (const luck of [0, 5, 20, 100, 10_000]) {
        for (const pity of [0, c.pityAt]) {
          const total = TIERS.reduce((sum, tier) => sum + chestChances(c, luck, pity)[tier], 0);
          expect(total, `${c.id} luck ${luck} pity ${pity}`).toBeCloseTo(1, 10);
        }
      }
    }
  });

  it('never puts weight on a tier outside the chest\'s pool', () => {
    for (const c of CHESTS) {
      const pool = new Set(poolOf(c));
      for (const tier of TIERS) {
        if (!pool.has(tier)) expect(chestChances(c, 40)[tier], `${c.id} ${tier}`).toBe(0);
      }
    }
  });

  it('gets rarer with luck, and only with luck', () => {
    const c = chest('gilded');
    expect(chestChances(c, 30).mythic).toBeGreaterThan(chestChances(c, 0).mythic);
    expect(chestChances(c, 30).epic).toBeLessThan(chestChances(c, 0).epic);
  });

  it('stops climbing once luck is absurd rather than promising certainty', () => {
    const c = chest('gilded');
    expect(chestChances(c, 10_000).mythic).toBe(chestChances(c, 45).mythic);
    expect(chestChances(c, 10_000).epic).toBeGreaterThan(0);
  });

  it('rules out everything under the floor once the floor is live', () => {
    const c = chest('gilded');
    const at = chestChances(c, 0, c.pityAt);
    expect(at.epic).toBe(0);
    expect(at.legendary + at.mythic).toBeCloseTo(1, 10);
  });

  /** The floor rules out the bad outcomes. It does not get an opinion about
   *  which of the good ones you land on. */
  it('keeps the tiers above the floor in exactly their old proportion', () => {
    const c = chest('gilded');
    const base = chestChances(c, 0, 0);
    const at = chestChances(c, 0, c.pityAt);
    expect(at.mythic / at.legendary).toBeCloseTo(base.mythic / base.legendary, 10);
  });
});

describe('rolling', () => {
  it('reads the tail first, so a low roll is the rarest outcome', () => {
    expect(rollChestTier(chest('gilded'), 0)).toBe('mythic');
    expect(rollChestTier(chest('gilded'), 0.999)).toBe('epic');
    expect(rollChestTier(chest('wooden'), 0.999)).toBe('common');
  });

  it('matches the odds it publishes, at the floor and away from it', () => {
    for (const c of CHESTS) {
      for (const pity of [0, c.pityAt]) {
        const next = rng(11 + c.pityAt + pity);
        const want = chestChances(c, 0, pity);
        const seen = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
        const n = 120_000;
        for (let i = 0; i < n; i += 1) seen[rollChestTier(c, next(), 0, pity)] += 1;
        for (const tier of poolOf(c)) {
          expect(seen[tier] / n, `${c.id} ${tier} at pity ${pity}`).toBeCloseTo(want[tier], 2);
        }
      }
    }
  });

  it('never lets a run pass its own window without paying out', () => {
    for (const c of CHESTS) {
      const next = rng(3 + c.pityAt);
      let pity = 0;
      let since = 0;
      let fired = 0;
      for (let i = 0; i < 40_000; i += 1) {
        if (chestPityFloor(c, pity)) fired += 1;
        const got = rollChestTier(c, next(), 0, pity);
        since = tierRank(got) >= tierRank(c.pityTier) ? 0 : since + 1;
        expect(since, c.id).toBeLessThanOrEqual(c.pityAt);
        pity = nextChestPity(c, pity, got);
      }
      expect(fired, c.id).toBeGreaterThan(0);
    }
  });
});

describe('what comes out', () => {
  it('names every kind of prize', () => {
    for (const kind of PRIZE_KINDS) expect(PRIZE_KIND_NAMES[kind]).toBeTruthy();
  });

  it('reads the tiers each catalogue actually has, rather than being told', () => {
    // Gear and companions run the whole ladder; the two cosmetic catalogues do
    // not, and that is exactly the fact this table exists to notice.
    for (const tier of TIERS) {
      expect(KIND_TIERS.gear.has(tier), `gear ${tier}`).toBe(true);
      expect(KIND_TIERS.companion.has(tier), `companion ${tier}`).toBe(true);
    }
    expect(KIND_TIERS.decor.has('mythic')).toBe(false);
  });

  it('never offers a kind that has nothing at that tier', () => {
    for (const c of CHESTS) {
      for (const tier of poolOf(c)) {
        for (const kind of PRIZE_KINDS) {
          if (kindChances(c, tier)[kind] === undefined) continue;
          expect(KIND_TIERS[kind].has(tier), `${c.id} ${tier} ${kind}`).toBe(true);
        }
      }
    }
  });

  it('renormalises what is left, so the kinds still sum to one', () => {
    for (const c of CHESTS) {
      for (const tier of poolOf(c)) {
        const chances = kindChances(c, tier);
        const total = PRIZE_KINDS.reduce((sum, k) => sum + (chances[k] ?? 0), 0);
        expect(total, `${c.id} ${tier}`).toBeCloseTo(1, 10);
      }
    }
  });

  it('always has something to hand over, at every tier of every chest', () => {
    for (const c of CHESTS) {
      for (const tier of poolOf(c)) {
        for (const roll of [0, 0.3, 0.7, 0.999999]) {
          expect(rollPrizeKind(c, tier, roll), `${c.id} ${tier} ${roll}`).not.toBeNull();
        }
      }
    }
  });
});

describe('opening one', () => {
  const one = { tier: 0.5, kind: 0.5, stat: 0.5, pick: 0.5 };
  /** One roll set per item, spread so the three do not all land the same. */
  const three = (over: Partial<typeof one> = {}) => [
    { ...one, ...over },
    { ...one, tier: 0.2, kind: 0.3, pick: 0.7, ...over },
    { ...one, tier: 0.8, kind: 0.7, pick: 0.2, ...over },
  ];

  it('is the same opening from the same rolls, every time', () => {
    const a = openChest(chest('silver'), three(), 3, 2);
    const b = openChest(chest('silver'), three(), 3, 2);
    expect(a).toEqual(b);
  });

  it('hands over one item per roll set', () => {
    expect(openChest(chest('gilded'), three()).prizes).toHaveLength(3);
    expect(openChest(chest('gilded'), [one]).prizes).toHaveLength(1);
    expect(openChest(chest('gilded'), []).prizes).toHaveLength(0);
  });

  it('describes prizes rather than handing them over', () => {
    const opening = openChest(chest('gilded'), three());
    expect(opening.chestId).toBe('gilded');
    for (const prize of opening.prizes) {
      expect(poolOf(chest('gilded'))).toContain(prize.tier);
      expect(prize.kind).not.toBeNull();
    }
  });

  it('carries the counter forward, one step per chest and not per item', () => {
    const c = chest('wooden');
    // Three commons: a chest that paid out nothing moves the counter by one,
    // however many items were in it.
    const low = openChest(c, three({ tier: 0.999 }), 0, 4);
    expect(low.prizes.map((p) => p.tier)).toEqual(['common', 'common', 'common']);
    expect(low.pity).toBe(5);

    // One rare anywhere in the chest clears it.
    const good = openChest(c, three({ tier: 0 }), 0, 4);
    expect(good.pity).toBe(0);
  });

  it('clears the counter on the best item, not the last one', () => {
    const c = chest('wooden');
    const mixed = openChest(c, [
      { ...one, tier: 0 },       // rare
      { ...one, tier: 0.999 },   // common
      { ...one, tier: 0.999 },   // common
    ], 0, 4);
    expect(mixed.prizes[0].tier).toBe('rare');
    expect(mixed.prizes[2].tier).toBe('common');
    expect(mixed.pity).toBe(0);
  });

  it('leaves the counter alone when there was nothing to open', () => {
    expect(openChest(chest('wooden'), [], 0, 4).pity).toBe(4);
  });

  describe('the floor, with three items in the chest', () => {
    const c = chest('silver');

    it('is not in force before the window', () => {
      const opening = openChest(c, three(), 0, 0);
      expect(opening.floor).toBeNull();
      expect(opening.lifted).toBe(false);
    });

    /**
     * The promise is about the chest, not about every item in it.
     *
     * A floor applied to all three would turn insurance into a jackpot — a
     * floored gilded chest would hand over three legendaries — and `pityLine`
     * says "guaranteed epic or better", singular. So exactly one item is
     * lifted and the other two keep whatever they rolled.
     */
    it('lifts one item to the floor and leaves the rest alone', () => {
      const opening = openChest(c, three({ tier: 0.999 }), 0, c.pityAt);
      expect(opening.floor).toBe('epic');
      expect(opening.lifted).toBe(true);

      const atOrAbove = opening.prizes
        .filter((p) => tierRank(p.tier) >= tierRank('epic'));
      expect(atOrAbove).toHaveLength(1);
      expect(opening.pity).toBe(0);
    });

    it('does not lift anything when the rolls already beat the floor', () => {
      // A tier roll of zero reaches the top of the pool on its own.
      const opening = openChest(c, three({ tier: 0 }), 0, c.pityAt);
      expect(opening.floor).toBe('epic');
      expect(opening.lifted).toBe(false);
      expect(opening.prizes.every((p) => tierRank(p.tier) >= tierRank('epic'))).toBe(true);
    });

    /** Whatever happens, the sentence on the chest has to come true. */
    it('keeps the promise on every chest, from every counter', () => {
      const next = rng(7);
      for (const c2 of CHESTS) {
        for (let i = 0; i < 300; i += 1) {
          const rolls = Array.from({ length: 3 }, () => ({
            tier: next(), kind: next(), stat: next(), pick: next(),
          }));
          const opening = openChest(c2, rolls, 0, c2.pityAt);
          expect(
            opening.prizes.some((p) => tierRank(p.tier) >= tierRank(c2.pityTier)),
            `${c2.id} draw ${i}`,
          ).toBe(true);
        }
      }
    });
  });

  it('clamps rolls that have no business being out of range', () => {
    const opening = openChest(chest('wooden'), [{ tier: 0.5, kind: 0.5, stat: -9, pick: 44 }]);
    expect(opening.prizes[0].statRoll).toBe(0);
    expect(opening.prizes[0].pickRoll).toBeLessThan(1);
    expect(opening.prizes[0].pickRoll).toBeGreaterThanOrEqual(0);
  });

  it('only ever produces tiers on the ladder, over a long run', () => {
    const next = rng(99);
    for (const c of CHESTS) {
      for (let i = 0; i < 700; i += 1) {
        const rolls = Array.from({ length: 3 }, () => ({
          tier: next(), kind: next(), stat: next(), pick: next(),
        }));
        for (const prize of openChest(c, rolls, 12, 0).prizes) {
          expect([...TIERS].sort(compareTiers)).toContain(prize.tier);
        }
      }
    }
  });
});

describe('the order things are shown in', () => {
  const at = (tier: Tier) => ({ tier });

  it('builds to the best thing in the chest', () => {
    const shown = showcaseOrder([at('epic'), at('common'), at('rare')]);
    expect(shown.map((p) => p.tier)).toEqual(['common', 'rare', 'epic']);
  });

  /**
   * The rolled order is a fact about what happened -- it is the order the
   * repository granted them in, which decides which of two items at the same
   * tier got the unowned one. The shown order is a choice about how to show
   * them, and it must not overwrite the fact.
   */
  it('copies rather than sorting what it was given', () => {
    const rolled = [at('epic'), at('common'), at('rare')];
    showcaseOrder(rolled);
    expect(rolled.map((p) => p.tier)).toEqual(['epic', 'common', 'rare']);
  });
});
