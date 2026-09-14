/**
 * The ground a stage is fought on.
 *
 * Seven small arenas, one per Island 1 stage, authored as rows of characters
 * for the same reason `zones.ts` authors its map that way: a map is the one
 * kind of data where the diff should look like the thing. A hedge moving one
 * tile is visible in text and invisible in a row of integers.
 *
 * ## Why these are not Tiled files
 *
 * The plan called for Tiled JSON under `content/islands/`. These are 11x7 —
 * seventy-seven characters — and every one of them uses the seven tiles
 * `TILE_KINDS` already declares and the art `sprites.ts` already draws. A Tiled
 * export of the same grid is several hundred lines of JSON carrying a tileset
 * reference, layer metadata and a firstgid, none of which this needs, plus a
 * loader to parse it and an editor anyone touching the file has to install.
 * The moment an arena wants object layers, multiple tile layers, or an artist
 * who is not editing TypeScript, Tiled earns its place. Seventy-seven
 * characters does not.
 *
 * ## Shape
 *
 * Every arena is the same size and reads left to right: the pet spawns on the
 * left, the monster stands on the right, and walking into the monster starts
 * the fight. The middle is what changes — open ground on the early stages,
 * something to go round on the later ones — so the island gets visibly tighter
 * without any stage becoming a maze.
 *
 * Pure. Phaser is in `features/eve-garden/scene/`.
 */

import { TILE_KINDS } from './zones';

export const ARENA_WIDTH = 11;
export const ARENA_HEIGHT = 7;

export interface Arena {
  /** Rows of `TILE_KINDS` characters. Every row `ARENA_WIDTH` long. */
  rows: readonly string[];
  /** Where the pet stands on arrival, in tiles. */
  spawn: { x: number; y: number };
  /** Where the stage's monster stands, in tiles. */
  monster: { x: number; y: number };
}

/**
 * Island 1's seven arenas, in stage order.
 *
 * Stage 5 is deliberately the most open of the seven, matching the breather it
 * is meant to be in `Data/Island1.cs`; stage 7 is the only one that walls the
 * boss off behind stone, so the last walk of the island is a committed one.
 */
export const ISLAND_1_ARENAS: readonly Arena[] = [
  // 1 — open meadow. Nothing in the way of the first fight anyone has.
  {
    rows: [
      '###########',
      '#.........#',
      '#.,,,,,,,.#',
      '=.,,,,,,,.#',
      '#.,,,,,,,.#',
      '#.........#',
      '###########',
    ],
    spawn: { x: 1, y: 3 },
    monster: { x: 9, y: 3 },
  },
  // 2 — a pond to walk round.
  {
    rows: [
      '###########',
      '#.........#',
      '#.,,~~,,,.#',
      '=.,,,,,,,.#',
      '#.,,~~,,,.#',
      '#.........#',
      '###########',
    ],
    spawn: { x: 1, y: 3 },
    monster: { x: 9, y: 3 },
  },
  // 3 — thistle beds, walkable but slow to read.
  {
    rows: [
      '###########',
      '#..*...*..#',
      '#.,,,,,,,.#',
      '=.,,,,,,,.#',
      '#.,,,,,,,.#',
      '#..*...*..#',
      '###########',
    ],
    spawn: { x: 1, y: 3 },
    monster: { x: 9, y: 3 },
  },
  // 4 — the semi-boss, behind a gap in a hedge.
  {
    rows: [
      '###########',
      '#....#....#',
      '#.,,.#.,,.#',
      '=.,,,,,,,.#',
      '#.,,.#.,,.#',
      '#....#....#',
      '###########',
    ],
    spawn: { x: 1, y: 3 },
    monster: { x: 9, y: 3 },
  },
  // 5 — the breather, and the most open ground on the island.
  {
    rows: [
      '###########',
      '#.........#',
      '#.........#',
      '=.........#',
      '#.........#',
      '#.........#',
      '###########',
    ],
    spawn: { x: 1, y: 3 },
    monster: { x: 9, y: 3 },
  },
  // 6 — the elite, in a stone hollow.
  {
    rows: [
      '###########',
      '#...ooo...#',
      '#.,,,.,,,.#',
      '=.,,,,,,,.#',
      '#.,,,.,,,.#',
      '#...ooo...#',
      '###########',
    ],
    spawn: { x: 1, y: 3 },
    monster: { x: 9, y: 3 },
  },
  // 7 — the boss. The only arena that walls its monster off, so the last walk
  // of the island goes through one gap and cannot be backed out of casually.
  {
    rows: [
      '###########',
      '#....o~o..#',
      '#.,,,o.,,.#',
      '=.,,,,,,,.#',
      '#.,,,o.,,.#',
      '#....o~o..#',
      '###########',
    ],
    spawn: { x: 1, y: 3 },
    monster: { x: 9, y: 3 },
  },
];

const BY_CHAR = new Map(TILE_KINDS.map((kind, index) => [kind.char, index]));

/**
 * The arena for a stage.
 *
 * Total: an island or stage with nothing authored falls back to island 1's
 * arena of the same number, and then to the first. A stage that renders the
 * wrong ground is a cosmetic mistake; one that renders no ground is a black
 * screen with a monster floating in it.
 */
export function arenaFor(island: number, stage: number): Arena {
  const index = Math.floor(stage) - 1;
  if (island === 1 && index >= 0 && index < ISLAND_1_ARENAS.length) {
    return ISLAND_1_ARENAS[index];
  }
  return ISLAND_1_ARENAS[Math.min(Math.max(index, 0), ISLAND_1_ARENAS.length - 1)]
    ?? ISLAND_1_ARENAS[0];
}

export function tileKindAt(arena: Arena, x: number, y: number) {
  if (y < 0 || y >= arena.rows.length) return undefined;
  const row = arena.rows[y];
  if (x < 0 || x >= row.length) return undefined;
  const index = BY_CHAR.get(row[x]);
  return index === undefined ? undefined : TILE_KINDS[index];
}

/** True when the pet may stand here. The single authority on movement. */
export function isWalkable(arena: Arena, x: number, y: number): boolean {
  const kind = tileKindAt(arena, x, y);
  return kind !== undefined && !kind.solid;
}

/** `TILE_KINDS` indices, which is the shape Phaser's tilemap wants. */
export function tileGrid(arena: Arena): number[][] {
  return arena.rows.map((row) => [...row].map((char) => BY_CHAR.get(char) ?? 0));
}

/** True when the pet is standing next to the monster, so the fight should open. */
export function isAdjacentToMonster(arena: Arena, x: number, y: number): boolean {
  const dx = Math.abs(x - arena.monster.x);
  const dy = Math.abs(y - arena.monster.y);
  return dx + dy === 1;
}
