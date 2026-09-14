import { describe, expect, it } from 'vitest';
import {
  ARENA_HEIGHT, ARENA_WIDTH, ISLAND_1_ARENAS, arenaFor, isAdjacentToMonster,
  isWalkable, tileGrid, tileKindAt,
} from './arena';
import { TILE_KINDS } from './zones';
import { hasSprite } from './sprites';

/** Breadth-first: is there any walkable route from a to b? */
function reachable(
  arena: (typeof ISLAND_1_ARENAS)[number],
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (at.x === to.x && at.y === to.y) return true;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const next = { x: at.x + dx, y: at.y + dy };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || !isWalkable(arena, next.x, next.y)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}

describe('the seven arenas', () => {
  it('draws one per stage, all the same size', () => {
    expect(ISLAND_1_ARENAS).toHaveLength(7);
    for (const [index, arena] of ISLAND_1_ARENAS.entries()) {
      expect(arena.rows, `stage ${index + 1}`).toHaveLength(ARENA_HEIGHT);
      for (const [y, row] of arena.rows.entries()) {
        expect(row.length, `stage ${index + 1} row ${y}`).toBe(ARENA_WIDTH);
      }
    }
  });

  it('uses only tiles the legend declares and the art draws', () => {
    const known = new Set(TILE_KINDS.map((k) => k.char));
    for (const [index, arena] of ISLAND_1_ARENAS.entries()) {
      for (const char of arena.rows.join('')) {
        expect(known.has(char), `stage ${index + 1}: ${char}`).toBe(true);
      }
    }
    for (const kind of TILE_KINDS) expect(hasSprite(kind.sprite), kind.sprite).toBe(true);
  });

  it('stands both the pet and the monster on ground they can occupy', () => {
    for (const [index, arena] of ISLAND_1_ARENAS.entries()) {
      expect(isWalkable(arena, arena.spawn.x, arena.spawn.y), `stage ${index + 1} spawn`).toBe(true);
      expect(isWalkable(arena, arena.monster.x, arena.monster.y), `stage ${index + 1} monster`).toBe(true);
    }
  });

  it('never spawns the pet on top of the monster', () => {
    for (const arena of ISLAND_1_ARENAS) {
      expect(arena.spawn).not.toEqual(arena.monster);
    }
  });

  /**
   * The one that matters. An arena whose monster cannot be walked to is a stage
   * nobody can clear and therefore an island nobody can finish — and it is
   * invisible in a diff, because a single misplaced `o` does it.
   */
  it('leaves a walkable route from the pet to the monster on every stage', () => {
    for (const [index, arena] of ISLAND_1_ARENAS.entries()) {
      expect(reachable(arena, arena.spawn, arena.monster), `stage ${index + 1} is sealed off`).toBe(true);
    }
  });

  it('walls every arena in, so nothing can walk off the map', () => {
    for (const [index, arena] of ISLAND_1_ARENAS.entries()) {
      for (let x = 0; x < ARENA_WIDTH; x += 1) {
        expect(isWalkable(arena, x, 0), `stage ${index + 1} top`).toBe(false);
        expect(isWalkable(arena, x, ARENA_HEIGHT - 1), `stage ${index + 1} bottom`).toBe(false);
      }
    }
  });

  it('gives the breather stage the most open ground on the island', () => {
    const open = ISLAND_1_ARENAS.map(
      (a) => [...a.rows.join('')].filter((_, i) =>
        isWalkable(a, i % ARENA_WIDTH, Math.floor(i / ARENA_WIDTH))).length,
    );
    expect(Math.max(...open)).toBe(open[4]);
  });
});

describe('arenaFor', () => {
  it('finds each of island one', () => {
    for (let stage = 1; stage <= 7; stage += 1) {
      expect(arenaFor(1, stage)).toBe(ISLAND_1_ARENAS[stage - 1]);
    }
  });

  it('always returns ground, never undefined', () => {
    // A stage that renders the wrong arena is cosmetic; one that renders none
    // is a black screen with a monster floating in it.
    for (const [island, stage] of [[1, 0], [1, 99], [2, 3], [99, 99], [-1, -1]]) {
      const arena = arenaFor(island, stage);
      expect(arena.rows).toHaveLength(ARENA_HEIGHT);
      expect(isWalkable(arena, arena.spawn.x, arena.spawn.y)).toBe(true);
    }
  });
});

describe('reading the ground', () => {
  const arena = ISLAND_1_ARENAS[0];

  it('refuses anything off the edge rather than throwing', () => {
    expect(tileKindAt(arena, -1, 0)).toBeUndefined();
    expect(tileKindAt(arena, 0, -1)).toBeUndefined();
    expect(tileKindAt(arena, ARENA_WIDTH, 0)).toBeUndefined();
    expect(isWalkable(arena, -1, -1)).toBe(false);
    expect(isWalkable(arena, 999, 999)).toBe(false);
  });

  it('converts to the index grid Phaser wants', () => {
    const grid = tileGrid(arena);
    expect(grid).toHaveLength(ARENA_HEIGHT);
    expect(grid[0]).toHaveLength(ARENA_WIDTH);
    for (const row of grid) {
      for (const index of row) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(TILE_KINDS.length);
      }
    }
  });

  it('opens the fight only from a tile actually touching the monster', () => {
    const { monster } = arena;
    expect(isAdjacentToMonster(arena, monster.x - 1, monster.y)).toBe(true);
    expect(isAdjacentToMonster(arena, monster.x, monster.y - 1)).toBe(true);
    // Standing on it, or diagonally off it, is not touching it.
    expect(isAdjacentToMonster(arena, monster.x, monster.y)).toBe(false);
    expect(isAdjacentToMonster(arena, monster.x - 1, monster.y - 1)).toBe(false);
    expect(isAdjacentToMonster(arena, monster.x - 2, monster.y)).toBe(false);
  });
});
