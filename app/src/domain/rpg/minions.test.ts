import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ISLAND_1_ARENAS, allyTile, isAdjacentToMonster, isWalkable } from './arena';
import { ISLANDS } from './islands';
import {
  MINIONS_PER_ISLAND, MINION_FIRST_ISLAND, MINION_LAST_STAGE, MINION_STAGE_BASE, MINION_XP,
  isMinionId, isMinionStage, minionSpots, minionsFor, minionsOnStage, monsterReachable,
} from './minions';
import { islandOfMonster, stageOfMonster } from './world';

const CS = resolve(__dirname, '../../../../game/HeartBeat.Game.Core');
const minionsCs = readFileSync(resolve(CS, 'Data/Minions.cs'), 'utf8');
const progressionCs = readFileSync(resolve(CS, 'Progression.cs'), 'utf8');

describe('the mirror of Minions.cs', () => {
  it('holds the same constants', () => {
    expect(minionsCs).toMatch(new RegExp(`const int StageBase = ${MINION_STAGE_BASE};`));
    expect(minionsCs).toMatch(new RegExp(`const int PerIsland = ${MINIONS_PER_ISLAND};`));
    expect(minionsCs).toMatch(new RegExp(`const int FirstIsland = ${MINION_FIRST_ISLAND};`));
    expect(progressionCs).toMatch(new RegExp(`MonsterType\\.Minion => ${MINION_XP},`));
  });

  it('builds ids and names the way the C# does', () => {
    expect(minionsCs).toContain('$"m{island}k{IndexOf(stage)}-{parent.SpriteKey}"');
    expect(minionsCs).toContain('$"Little {parentName}"');
  });

  it('follows the stage 1 and stage 2 commons of islands 5 and up, and nothing before', () => {
    for (const island of ISLANDS) {
      const found = minionsFor(island.number);
      if (island.number < MINION_FIRST_ISLAND) { expect(found).toEqual([]); continue; }
      expect(found).toHaveLength(MINIONS_PER_ISLAND);
      found.forEach((minion, i) => {
        const parent = island.stages[i];
        expect(parent.type, `${island.number}`).toBe('Common');
        expect(minion.spriteKey).toBe(parent.spriteKey);
        expect(minion.stage).toBe(MINION_STAGE_BASE + i + 1);
        expect(minion.name).toBe(`Little ${parent.monster}`);
      });
    }
  });
});

describe('a skirmish is never a stage', () => {
  it('has an id that progress cannot read, and a stage number nothing else has', () => {
    for (const island of ISLANDS) {
      for (const minion of minionsFor(island.number)) {
        expect(isMinionId(minion.id)).toBe(true);
        expect(islandOfMonster(minion.id)).toBeUndefined();
        expect(stageOfMonster(minion.id)).toBeUndefined();
        expect(isMinionStage(minion.stage)).toBe(true);
        expect(minion.stage).toBeGreaterThan(island.stages.length);
      }
    }
  });

  it('keeps real monster ids out of the skirmish shape', () => {
    for (const island of ISLANDS) for (const s of island.stages) expect(isMinionId(s.monsterId)).toBe(false);
  });

  it('has unique ids across the world', () => {
    const ids = ISLANDS.flatMap((i) => [...i.stages.map((s) => s.monsterId), ...minionsFor(i.number).map((m) => m.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('where they stand', () => {
  it('finds two spots on every arena, on open ground away from the fights', () => {
    ISLAND_1_ARENAS.forEach((arena, index) => {
      const spots = minionSpots(arena);
      expect(spots, `arena ${index + 1}`).toHaveLength(MINIONS_PER_ISLAND);
      const ally = allyTile(arena);
      for (const spot of spots) {
        expect(isWalkable(arena, spot.x, spot.y)).toBe(true);
        expect(spot).not.toEqual(arena.spawn);
        expect(spot).not.toEqual(arena.monster);
        expect(isAdjacentToMonster(arena, spot.x, spot.y)).toBe(false);
        if (ally) expect(spot).not.toEqual(ally);
      }
    });
  });

  it('never walls the monster off', () => {
    ISLAND_1_ARENAS.forEach((arena, index) => {
      expect(monsterReachable(arena, minionSpots(arena)), `arena ${index + 1}`).toBe(true);
    });
  });

  it('is the same every time, so a rebuilt scene puts them back where they were', () => {
    expect(minionSpots(ISLAND_1_ARENAS[2])).toEqual(minionSpots(ISLAND_1_ARENAS[2]));
  });
});

describe('who is on a stage', () => {
  const arena = ISLAND_1_ARENAS[0];

  it('is nobody before island 5, and nobody on the boss stage', () => {
    expect(minionsOnStage(4, 1, arena)).toEqual([]);
    expect(minionsOnStage(5, MINION_LAST_STAGE + 1, arena)).toEqual([]);
  });

  it('is both skirmishes on a stage of island 5 and up', () => {
    expect(minionsOnStage(5, 1, arena)).toHaveLength(2);
    expect(minionsOnStage(10, MINION_LAST_STAGE, arena)).toHaveLength(2);
  });

  it('leaves out the ones already beaten today', () => {
    const [first, second] = minionsFor(5);
    expect(minionsOnStage(5, 1, arena, [first.id]).map((m) => m.id)).toEqual([second.id]);
    expect(minionsOnStage(5, 1, arena, [first.id, second.id])).toEqual([]);
  });
});
