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
