import { describe, expect, it } from 'vitest';
import {
  CHESTS, CHEST_IDS, KIND_TIERS, PRIZE_KINDS, PRIZE_KIND_NAMES, chestById, chestChances,
  chestPityFloor, insuredTiers, kindChances, nextChestPity, openChest, pityLine, poolOf,
  rollChestTier, rollPrizeKind, type Chest,
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
   * The honest-pity property, stated as arithmetic. A window somebody reaches
   * half the time is not insurance, it is the real drop rate with a second
   * name; a window nobody reaches is decoration. Between one run in four and
   * one in twenty is where it removes a bad tail without moving the median.
   */
  it('is reachable rarely enough to be insurance and often enough to be real', () => {
    for (const c of CHESTS) {
      const miss = poolOf(c)
        .filter((tier) => tierRank(tier) < tierRank(c.pityTier))
        .reduce((sum, tier) => sum + (c.weights[tier] ?? 0), 0);
      const reached = miss ** c.pityAt;
      expect(reached, `${c.id} reaches its floor ${(reached * 100).toFixed(1)}% of runs`)
        .toBeLessThan(0.3);
      expect(reached, c.id).toBeGreaterThan(0.005);
    }
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
    expect(pityLine(c, 0)).toBe(`Guaranteed Epic or better within ${c.pityAt} draws.`);
    expect(pityLine(c, 2)).toBe(`Guaranteed Epic in ${c.pityAt - 2} draws.`);
    expect(pityLine(c, c.pityAt - 1)).toBe('Guaranteed Epic in 1 draw.');
    expect(pityLine(c, c.pityAt)).toBe('Guaranteed Epic or better — this one.');
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
  const rolls = { tier: 0.5, kind: 0.5, stat: 0.5, pick: 0.5 };

  it('is the same draw from the same rolls, every time', () => {
    const a = openChest(chest('silver'), rolls, 3, 2);
    const b = openChest(chest('silver'), rolls, 3, 2);
    expect(a).toEqual(b);
  });

  it('describes a prize rather than handing one over', () => {
    const draw = openChest(chest('gilded'), rolls);
    expect(poolOf(chest('gilded'))).toContain(draw.tier);
    expect(draw.kind).not.toBeNull();
    expect(draw.chestId).toBe('gilded');
  });

  it('carries the counter forward', () => {
    const c = chest('wooden');
    const low = openChest(c, { ...rolls, tier: 0.999 }, 0, 4);
    expect(low.tier).toBe('common');
    expect(low.pity).toBe(5);
    const good = openChest(c, { ...rolls, tier: 0 }, 0, 4);
    expect(good.tier).toBe('rare');
    expect(good.pity).toBe(0);
  });

  it('says when the floor is what produced the draw', () => {
    const c = chest('silver');
    expect(openChest(c, rolls, 0, 0).flooredBy).toBeNull();
    const floored = openChest(c, rolls, 0, c.pityAt);
    expect(floored.flooredBy).toBe('epic');
    expect(tierRank(floored.tier)).toBeGreaterThanOrEqual(tierRank('epic'));
  });

  it('clamps rolls that have no business being out of range', () => {
    const draw = openChest(chest('wooden'), { tier: 0.5, kind: 0.5, stat: -9, pick: 44 });
    expect(draw.statRoll).toBe(0);
    expect(draw.pickRoll).toBeLessThan(1);
    expect(draw.pickRoll).toBeGreaterThanOrEqual(0);
  });

  it('only ever produces tiers on the ladder, over a long run', () => {
    const next = rng(99);
    for (const c of CHESTS) {
      for (let i = 0; i < 2000; i += 1) {
        const draw = openChest(c, { tier: next(), kind: next(), stat: next(), pick: next() }, 12, 0);
        expect([...TIERS].sort(compareTiers)).toContain(draw.tier);
      }
    }
  });
});
