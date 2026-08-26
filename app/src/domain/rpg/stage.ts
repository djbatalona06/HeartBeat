import type { Stage, StageId } from './types';

/**
 * Finch's growth stages. The bird does not grow because you performed well; it
 * grows because time passed and you kept showing up, which is the whole point
 * of the metaphor.
 *
 * Two curves run against each other as the stages climb, exactly as Finch's do:
 * an adventure costs **more** energy and takes **less** time. Early on the pet
 * is cheap to send out and gone most of the day; later it is expensive and back
 * before dinner. That is what makes a grown companion feel capable rather than
 * simply bigger.
 */
export const STAGES: Stage[] = [
  {
    id: 'egg',
    name: 'Egg',
    minLevel: 1,
    energyCost: 5,
    adventureHours: 8,
    baseMaxEnergy: 30,
    blurb: 'Warm, quiet, and entirely yours. Nothing is expected of it yet.',
  },
  {
    id: 'hatchling',
    name: 'Hatchling',
    minLevel: 3,
    energyCost: 10,
    adventureHours: 6,
    baseMaxEnergy: 40,
    blurb: 'It has opinions now, most of them about breakfast.',
  },
  {
    id: 'fledgling',
    name: 'Fledgling',
    minLevel: 6,
    energyCost: 15,
    adventureHours: 5,
    baseMaxEnergy: 55,
    blurb: 'First short trips, and it comes back telling you everything.',
  },
  {
    id: 'youngling',
    name: 'Youngling',
    minLevel: 10,
    energyCost: 20,
    adventureHours: 4,
    baseMaxEnergy: 70,
    blurb: 'Goes further than you would send it, and is fine.',
  },
  {
    id: 'companion',
    name: 'Companion',
    minLevel: 15,
    energyCost: 25,
    adventureHours: 3,
    baseMaxEnergy: 85,
    blurb: 'It knows the route. You are the one being kept company now.',
  },
  {
    id: 'guardian',
    name: 'Guardian',
    minLevel: 21,
    energyCost: 30,
    adventureHours: 2,
    baseMaxEnergy: 100,
    blurb: 'Stands between the two of you and whatever the week brought.',
  },
];

export function stageForLevel(level: number): Stage {
  let current = STAGES[0];
  for (const stage of STAGES) if (level >= stage.minLevel) current = stage;
  return current;
}

export function stageById(id: StageId): Stage {
  const found = STAGES.find((s) => s.id === id);
  if (!found) throw new Error(`unknown stage: ${id}`);
  return found;
}

/** The level the next stage arrives at, or null once the last one is reached. */
export function nextStageLevel(level: number): number | null {
  const next = STAGES.find((s) => s.minLevel > level);
  return next ? next.minLevel : null;
}

export function nextStage(level: number): Stage | null {
  return STAGES.find((s) => s.minLevel > level) ?? null;
}

/**
 * Whether tonight's list can get the pet out the door. This is the question the
 * energy economy exists to answer, and it has to be answerable before you start
 * — hence energy being independent of task value.
 */
export function canAdventure(level: number, energy: number): boolean {
  return energy >= stageForLevel(level).energyCost;
}

export interface AdventureCost {
  energy: number;
  hours: number;
  shortBy: number;
}

export function adventureCost(level: number, energy: number): AdventureCost {
  const stage = stageForLevel(level);
  return {
    energy: stage.energyCost,
    hours: stage.adventureHours,
    shortBy: Math.max(0, stage.energyCost - energy),
  };
}
