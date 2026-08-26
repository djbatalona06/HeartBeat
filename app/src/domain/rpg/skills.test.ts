import { describe, expect, it } from 'vitest';
import {
  SKILLS,
  canCast,
  castBlockedBecause,
  scaleEffect,
  skillById,
  unlockedSkills,
} from './skills';
import { statsFor } from './avatar';

describe('the four skills', () => {
  it('are the ones named from the letter, not from stock fantasy', () => {
    expect(SKILLS.map((s) => s.name)).toEqual([
      'Ember Strike', "Stargazer's Ward", 'Lily Bloom', 'Second Wind',
    ]);
  });

  it('has a unique id and a line for each', () => {
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
    for (const skill of SKILLS) expect(skill.blurb.length).toBeGreaterThan(20);
  });

  it('costs more MP the later it unlocks', () => {
    for (let i = 1; i < SKILLS.length; i += 1) {
      expect(SKILLS[i].minLevel).toBeGreaterThan(SKILLS[i - 1].minLevel);
      expect(SKILLS[i].mpCost).toBeGreaterThan(SKILLS[i - 1].mpCost);
    }
  });

  it('does something in every case', () => {
    for (const skill of SKILLS) {
      const e = skill.effect;
      expect(
        (e.damage ?? 0) + (e.shield ?? 0) + (e.heal ?? 0) + (e.energy ?? 0),
        skill.id,
      ).toBeGreaterThan(0);
    }
  });

  /**
   * Energy is the one effect that reaches daily life, and it only ever adds.
   * Nothing in the skill table can subtract from a pool.
   */
  it('holds no negative number anywhere', () => {
    for (const skill of SKILLS) {
      for (const [field, value] of Object.entries(skill.effect)) {
        expect(value, `${skill.id}.${field}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('unlocking', () => {
  it('opens up as the level climbs, and never closes', () => {
    let count = 0;
    for (let level = 1; level <= 20; level += 1) {
      const open = unlockedSkills(level).length;
      expect(open).toBeGreaterThanOrEqual(count);
      count = open;
    }
    expect(unlockedSkills(1)).toHaveLength(0);
    expect(unlockedSkills(20)).toHaveLength(SKILLS.length);
  });

  it('looks a skill up by id', () => {
    expect(skillById('lily-bloom')?.name).toBe('Lily Bloom');
    expect(skillById('fireball')).toBeUndefined();
  });
});

describe('casting', () => {
  const ember = skillById('ember-strike')!;

  it('needs both the level and the MP', () => {
    expect(canCast(ember, 3, 8)).toBe(true);
    expect(canCast(ember, 2, 99)).toBe(false);
    expect(canCast(ember, 9, 7)).toBe(false);
  });

  it('says which of the two is missing', () => {
    expect(castBlockedBecause(ember, 2, 99)).toContain('level 3');
    expect(castBlockedBecause(ember, 9, 7)).toContain('8 MP');
    expect(castBlockedBecause(ember, 9, 8)).toBeNull();
  });
});

describe('scaleEffect', () => {
  it('sharpens the flat effects with insight', () => {
    const ward = skillById('stargazers-ward')!;
    const low = scaleEffect(ward.effect, statsFor(1));
    const high = scaleEffect(ward.effect, statsFor(20));
    expect(high.shield!).toBeGreaterThan(low.shield!);
  });

  /** Damage is already a multiple of a strength-scaled hit; scaling it twice
      would make insight quietly the better damage stat. */
  it('leaves the damage multiplier alone', () => {
    const ember = skillById('ember-strike')!;
    expect(scaleEffect(ember.effect, statsFor(30)).damage).toBe(ember.effect.damage);
  });

  it('does not invent an effect the skill does not have', () => {
    const ember = skillById('ember-strike')!;
    expect(scaleEffect(ember.effect, statsFor(30)).heal).toBeUndefined();
  });
});
