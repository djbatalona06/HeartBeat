import { describe, expect, it } from 'vitest';
import { RARITIES, type Rarity } from './gear';
import {
  BASE_DROP_CHANCES,
  MAX_PET_RANK,
  PET_KINDS,
  PET_RANK_BONDS,
  SPECIES_NAMES,
  dropChances,
  maxPetMp,
  petKindById,
  petKindsOfRarity,
  petSheet,
  rankOf,
  PITY_AT,
  chancesFor,
  nextPity,
  pityFloor,
  rollKind,
  rollRarity,
  type PetInstance,
  type PetSpecies,
} from './pets';

const SPECIES = Object.keys(SPECIES_NAMES) as PetSpecies[];
const AT = 1_700_000_000_000;

function pet(over: Partial<PetInstance> = {}): PetInstance {
  return {
    id: 'p1',
    coupleId: 'c1',
    memberId: 'm1',
    kindId: 'cat-rare',
    bond: 0,
    mp: 0,
    hatchedAt: AT,
    updatedAt: AT,
    ...over,
  };
}

describe('the sixteen pets', () => {
  it('is exactly four species at four rarities', () => {
    expect(PET_KINDS).toHaveLength(16);
    for (const species of SPECIES) {
      const rarities = PET_KINDS.filter((p) => p.species === species).map((p) => p.rarity);
      expect(new Set(rarities), species).toEqual(new Set(RARITIES));
    }
    for (const rarity of RARITIES) expect(petKindsOfRarity(rarity)).toHaveLength(4);
  });

  it('gives every pet a unique id and a unique name', () => {
    expect(new Set(PET_KINDS.map((p) => p.id)).size).toBe(16);
    expect(new Set(PET_KINDS.map((p) => p.name)).size).toBe(16);
  });

  /** An egg tells you nothing. That is the whole of why an egg is worth having. */
  it('gives every pet its own lore, and none of it repeats', () => {
    for (const kind of PET_KINDS) expect(kind.lore.length, kind.id).toBeGreaterThan(20);
    expect(new Set(PET_KINDS.map((p) => p.lore)).size).toBe(16);
  });

  it('names no collectible after anybody else\'s character', () => {
    // The cat is the repository's own hand-drawn mark, named descriptively for
    // it. See NOTICE.md — a character you collect is a stronger claim than a
    // palette label, so nothing here borrows one.
    const forbidden = /hello kitty|sanrio|spongebob|naruto|pikachu|mickey/i;
    for (const kind of PET_KINDS) {
      expect(kind.name, kind.id).not.toMatch(forbidden);
      expect(kind.lore, kind.id).not.toMatch(forbidden);
    }
    for (const name of Object.values(SPECIES_NAMES)) expect(name).not.toMatch(forbidden);
  });
});

describe('a pet\'s own MP bar', () => {
  it('starts higher for a rarer pet', () => {
    const lowest = (rarity: Rarity) => Math.min(...petKindsOfRarity(rarity).map((p) => p.baseMp));
    for (let i = 1; i < RARITIES.length; i += 1) {
      expect(lowest(RARITIES[i])).toBeGreaterThan(lowest(RARITIES[i - 1]));
    }
  });

  it('grows with rank progression, not with your level', () => {
    const kind = petKindById('cat-godly')!;
    for (let rank = 2; rank <= MAX_PET_RANK; rank += 1) {
      expect(maxPetMp(kind, rank)).toBeGreaterThan(maxPetMp(kind, rank - 1));
    }
    expect(maxPetMp(kind, 1)).toBe(kind.baseMp);
  });

  it('costs more MP for a rarer pet\'s skill, and unlocks it later', () => {
    const cost = (rarity: Rarity) =>
      Math.min(...petKindsOfRarity(rarity).map((p) => p.skill.mpCost));
    for (let i = 1; i < RARITIES.length; i += 1) {
      expect(cost(RARITIES[i])).toBeGreaterThan(cost(RARITIES[i - 1]));
    }
    for (const kind of PET_KINDS) {
      expect(kind.skill.minRank, kind.id).toBeGreaterThanOrEqual(1);
      expect(kind.skill.minRank, kind.id).toBeLessThanOrEqual(MAX_PET_RANK);
    }
  });

  it('can always eventually afford its own skill', () => {
    for (const kind of PET_KINDS) {
      expect(maxPetMp(kind, MAX_PET_RANK), kind.id).toBeGreaterThanOrEqual(kind.skill.mpCost);
    }
  });

  it('gives every pet a skill nobody else has', () => {
    const ids = PET_KINDS.map((p) => p.skill.id);
    expect(new Set(ids).size).toBe(16);
    expect(new Set(PET_KINDS.map((p) => p.skill.name)).size).toBe(16);
  });
});

describe('rank', () => {
  it('is derived from bond and never stored', () => {
    expect(Object.keys(pet())).not.toContain('rank');
  });

  it('climbs at each threshold and stops at the ceiling', () => {
    expect(rankOf(0)).toBe(1);
    for (let i = 1; i < PET_RANK_BONDS.length; i += 1) {
      expect(rankOf(PET_RANK_BONDS[i] - 1)).toBe(i);
      expect(rankOf(PET_RANK_BONDS[i])).toBe(i + 1);
    }
    expect(rankOf(999_999)).toBe(MAX_PET_RANK);
  });

  it('never regresses as bond rises', () => {
    let last = 0;
    for (let bond = 0; bond <= 400; bond += 7) {
      const rank = rankOf(bond);
      expect(rank).toBeGreaterThanOrEqual(last);
      last = rank;
    }
  });
});

describe('petSheet', () => {
  it('says why a skill is not ready instead of just refusing', () => {
    const fresh = petSheet(pet({ kindId: 'cat-godly', bond: 0, mp: 99 }));
    expect(fresh.skillReady).toBe(false);
    expect(fresh.skillBlockedBecause).toContain('rank 4');

    const ranked = petSheet(pet({ kindId: 'cat-godly', bond: 300, mp: 0 }));
    expect(ranked.skillBlockedBecause).toContain('MP');
  });

  it('is ready once the rank and the MP are both there', () => {
    const sheet = petSheet(pet({ kindId: 'cat-common', bond: 0, mp: 8 }));
    expect(sheet.skillReady).toBe(true);
    expect(sheet.skillBlockedBecause).toBeNull();
  });

  it('never shows more MP than the bar holds', () => {
    const sheet = petSheet(pet({ mp: 10_000 }));
    expect(sheet.mp).toBe(sheet.maxMp);
  });

  it('counts down to the next rank, and reports null at the ceiling', () => {
    expect(petSheet(pet({ bond: 5 })).toNextRank).toBe(PET_RANK_BONDS[1] - 5);
    expect(petSheet(pet({ bond: 10_000 })).toNextRank).toBeNull();
  });

  it('throws on a kind that does not exist rather than inventing one', () => {
    expect(() => petSheet(pet({ kindId: 'dragon-godly' }))).toThrow();
  });
});

describe('drop chances', () => {
  const sums = (c: Record<Rarity, number>) => RARITIES.reduce((s, r) => s + c[r], 0);

  it('always adds up to one', () => {
    for (const luck of [0, 1, 5, 20, 60, 400]) {
      for (const bonus of [0, 0.2, 0.3]) {
        expect(sums(dropChances(luck, bonus))).toBeCloseTo(1, 10);
      }
    }
  });

  it('is the base table when luck is nothing and nothing has been won', () => {
    expect(dropChances(0, 0)).toEqual(BASE_DROP_CHANCES);
  });

  it('gets rarer with luck, and only with luck', () => {
    const plain = dropChances(0);
    const lucky = dropChances(20);
    expect(lucky.godly).toBeGreaterThan(plain.godly);
    expect(lucky.epic).toBeGreaterThan(plain.epic);
    expect(lucky.common).toBeLessThan(plain.common);
  });

  it('stops climbing once luck is absurd, rather than promising certainty', () => {
    expect(dropChances(10_000).godly).toBe(dropChances(45).godly);
    expect(dropChances(10_000).common).toBeGreaterThan(0);
  });

  /**
   * The victory reward, stated exactly: a bonus of b multiplies the chance of
   * every rarity above common by 1 + b, and common absorbs the remainder.
   */
  it('lifts every rarity above common by exactly the bonus', () => {
    for (const bonus of [0.2, 0.25, 0.3]) {
      const plain = dropChances(12);
      const after = dropChances(12, bonus);
      for (const rarity of ['rare', 'epic', 'godly'] as Rarity[]) {
        expect(after[rarity], `${rarity} @ ${bonus}`).toBeCloseTo(plain[rarity] * (1 + bonus), 10);
      }
      expect(after.common).toBeLessThan(plain.common);
    }
  });
});

describe('rolling a drop', () => {
  it('reads the tail first, so a low roll is the rarest outcome', () => {
    expect(rollRarity(0, 0)).toBe('godly');
    expect(rollRarity(0.999, 0)).toBe('common');
  });

  it('lands on each rarity in proportion over many rolls', () => {
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, godly: 0 };
    const n = 20_000;
    for (let i = 0; i < n; i += 1) counts[rollRarity((i + 0.5) / n, 0)] += 1;
    for (const rarity of RARITIES) {
      expect(counts[rarity] / n, rarity).toBeCloseTo(BASE_DROP_CHANCES[rarity], 2);
    }
  });

  it('produces more rare-or-better after a victory than before', () => {
    const n = 5000;
    const rareOrBetter = (bonus: number) => {
      let hits = 0;
      for (let i = 0; i < n; i += 1) if (rollRarity((i + 0.5) / n, 8, bonus) !== 'common') hits += 1;
      return hits;
    };
    expect(rareOrBetter(0.25)).toBeGreaterThan(rareOrBetter(0));
  });

  it('picks a species with a second, independent roll', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 4; i += 1) seen.add(rollKind(0, (i + 0.5) / 4, 0).species);
    expect(seen.size).toBe(4);
  });

  it('never rolls a species off the end of the pool', () => {
    expect(rollKind(0, 0.999999, 0)).toBeTruthy();
    expect(rollKind(0.999999, 1, 0)).toBeTruthy();
  });
});

/* ---- pity -----------------------------------------------------------------
 * Two properties carry this feature, and both fail silently.
 *
 * A pity that never fires is a comment. A pity that quietly lifts the real
 * rate above the printed one turns the odds on screen into a lie — which is
 * worse than not publishing them, because somebody is now relying on a number
 * that is wrong.
 */

describe('pityFloor', () => {
  it('holds off until exactly PITY_AT, not one egg earlier', () => {
    expect(pityFloor(PITY_AT - 1)).toBeNull();
    expect(pityFloor(PITY_AT)).toBe('epic');
  });

  it('stays in force past the threshold rather than lapsing', () => {
    expect(pityFloor(PITY_AT + 40)).toBe('epic');
  });

  it('is not tripped by a negative count', () => {
    expect(pityFloor(-5)).toBeNull();
  });
});

describe('nextPity', () => {
  it('clears on an epic or better, and only on those', () => {
    expect(nextPity(9, 'epic')).toBe(0);
    expect(nextPity(9, 'godly')).toBe(0);
    expect(nextPity(9, 'rare')).toBe(10);
    expect(nextPity(9, 'common')).toBe(10);
  });

  it('counts up from nothing, and never below it', () => {
    expect(nextPity(0, 'common')).toBe(1);
    expect(nextPity(-3, 'common')).toBe(1);
  });
});

describe('chancesFor', () => {
  it('is the ordinary table until the floor is reached', () => {
    expect(chancesFor(0, 0, PITY_AT - 1)).toEqual(dropChances(0, 0));
    expect(chancesFor(6, 0.25, 3)).toEqual(dropChances(6, 0.25));
  });

  it('rules out the bottom two at the floor, and still sums to one', () => {
    const at = chancesFor(0, 0, PITY_AT);
    expect(at.common).toBe(0);
    expect(at.rare).toBe(0);
    expect(at.epic + at.godly).toBeCloseTo(1, 10);
  });

  /** Pity rules out the two below epic. It does not get an opinion about
   *  which of the two above you land on. */
  it('keeps godly and epic in exactly their old proportion', () => {
    const base = dropChances(0, 0);
    const at = chancesFor(0, 0, PITY_AT);
    expect(at.godly / at.epic).toBeCloseTo(base.godly / base.epic, 10);
  });

  it('never sums to more or less than one, at any luck or bonus', () => {
    for (const luck of [0, 5, 20, 100]) {
      for (const bonus of [0, 0.2, 0.3]) {
        for (const pity of [0, PITY_AT]) {
          const c = chancesFor(luck, bonus, pity);
          const total = c.common + c.rare + c.epic + c.godly;
          expect(total, `luck ${luck} bonus ${bonus} pity ${pity}`).toBeCloseTo(1, 10);
        }
      }
    }
  });
});

describe('rollRarity under pity', () => {
  it('can only hand back an epic or a godly at the floor', () => {
    const n = 2000;
    for (let i = 0; i < n; i += 1) {
      const got = rollRarity((i + 0.5) / n, 0, 0, PITY_AT);
      expect(['epic', 'godly']).toContain(got);
    }
  });

  /** The floor lifts; it must never pull a good roll down. */
  it('never lowers a roll that was already epic or better', () => {
    const n = 2000;
    for (let i = 0; i < n; i += 1) {
      const roll = (i + 0.5) / n;
      const without = rollRarity(roll, 0, 0, 0);
      if (without !== 'epic' && without !== 'godly') continue;
      const withPity = rollRarity(roll, 0, 0, PITY_AT);
      if (without === 'godly') expect(withPity).toBe('godly');
      else expect(['epic', 'godly']).toContain(withPity);
    }
  });
});

describe('pity end to end', () => {
  /** A cheap deterministic generator, so the run is reproducible and a failure
   *  is a failure rather than a bad afternoon. */
  function rng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  /**
   * The promise, exercised: walk a long run of eggs the way `buyEgg` does and
   * assert that a couple is never made to sit through more than PITY_AT of
   * them without something good.
   */
  it('never lets a run of PITY_AT eggs pass without an epic or better', () => {
    const next = rng(20260913);
    let pity = 0;
    let sinceGood = 0;
    let fired = 0;

    for (let i = 0; i < 100_000; i += 1) {
      const atFloor = pityFloor(pity) !== null;
      const got = rollRarity(next(), 0, 0, pity);
      if (atFloor) fired += 1;

      if (got === 'epic' || got === 'godly') sinceGood = 0;
      else sinceGood += 1;

      expect(sinceGood).toBeLessThanOrEqual(PITY_AT);
      pity = nextPity(pity, got);
    }

    // And it is actually doing something — a pity that never triggers across a
    // hundred thousand eggs would pass the assertion above and mean nothing.
    expect(fired).toBeGreaterThan(0);
  });

  /**
   * The honesty property. The table the screen shows is `chancesFor`, so the
   * empirical distribution of the next pull must match it — at the floor and
   * away from it. If this drifts, the published odds have become a lie.
   */
  it('matches the odds it publishes, both at the floor and away from it', () => {
    for (const pity of [0, PITY_AT]) {
      const next = rng(7 + pity);
      const want = chancesFor(0, 0, pity);
      const seen: Record<string, number> = { common: 0, rare: 0, epic: 0, godly: 0 };
      const n = 200_000;

      for (let i = 0; i < n; i += 1) seen[rollRarity(next(), 0, 0, pity)] += 1;

      for (const rarity of ['common', 'rare', 'epic', 'godly'] as const) {
        expect(seen[rarity] / n, `${rarity} at pity ${pity}`).toBeCloseTo(want[rarity], 2);
      }
    }
  });
});
