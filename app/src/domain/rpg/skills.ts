import type { Stats } from './types';

/**
 * Skills cost MP and are named from the imagery in the letter rather than from
 * stock fantasy. A skill named *Frost Nova* belongs to somebody else's game;
 * these four belong to this one.
 *
 * Every effect here is scoped to a boss fight except `energy`, which is the
 * single line the RPG layer draws back into daily life — and it only ever adds.
 */
export interface SkillEffect {
  /** Damage dealt, as a multiple of the caster's ordinary hit. */
  damage?: number;
  /** Damage absorbed from the boss's next swing. */
  shield?: number;
  /** Party health restored. Health exists only here, inside the fight. */
  heal?: number;
  /** Energy returned to the caster. Reaches daily life; never subtracts. */
  energy?: number;
}

export interface Skill {
  id: string;
  name: string;
  blurb: string;
  mpCost: number;
  minLevel: number;
  effect: SkillEffect;
}

export const SKILLS: Skill[] = [
  {
    id: 'ember-strike',
    name: 'Ember Strike',
    blurb: 'One coal, kept alive all night, put exactly where it will catch.',
    mpCost: 8,
    minLevel: 3,
    effect: { damage: 1.8 },
  },
  {
    id: 'stargazers-ward',
    name: "Stargazer's Ward",
    blurb: 'Look up long enough and the thing in front of you gets smaller.',
    mpCost: 10,
    minLevel: 6,
    effect: { shield: 18 },
  },
  {
    id: 'lily-bloom',
    name: 'Lily Bloom',
    blurb: 'Opens on its own schedule, and always for both of you at once.',
    mpCost: 12,
    minLevel: 9,
    effect: { heal: 22 },
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    blurb: 'Not extra strength. The ordinary amount, arriving later than expected.',
    mpCost: 14,
    minLevel: 12,
    effect: { energy: 12 },
  },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function skillById(id: string): Skill | undefined {
  return BY_ID.get(id);
}

export function unlockedSkills(level: number): Skill[] {
  return SKILLS.filter((s) => level >= s.minLevel);
}

export function canCast(skill: Skill, level: number, mp: number): boolean {
  return level >= skill.minLevel && mp >= skill.mpCost;
}

/**
 * Why a cast failed, in words the screen can use. A dead button that never says
 * why is the interaction this app is trying not to have.
 */
export function castBlockedBecause(skill: Skill, level: number, mp: number): string | null {
  if (level < skill.minLevel) return `${skill.name} unlocks at level ${skill.minLevel}.`;
  if (mp < skill.mpCost) return `${skill.name} needs ${skill.mpCost} MP.`;
  return null;
}

/** Insight sharpens what a skill does, the way strength sharpens a plain hit. */
export const INSIGHT_SCALING = 0.04;

export function scaleEffect(effect: SkillEffect, stats: Stats): SkillEffect {
  const factor = 1 + Math.max(0, stats.insight) * INSIGHT_SCALING;
  const scaled: SkillEffect = {};
  if (effect.damage !== undefined) scaled.damage = effect.damage;
  if (effect.shield !== undefined) scaled.shield = Math.round(effect.shield * factor);
  if (effect.heal !== undefined) scaled.heal = Math.round(effect.heal * factor);
  if (effect.energy !== undefined) scaled.energy = Math.round(effect.energy * factor);
  return scaled;
}
