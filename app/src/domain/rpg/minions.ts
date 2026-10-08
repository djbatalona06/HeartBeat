import { ISLANDS } from './islands';
import {
  ARENA_HEIGHT, ARENA_WIDTH, allyTile, isAdjacentToMonster, isWalkable, type Arena,
} from './arena';

/**
 * The small optional foes on islands 5 and up: a tested mirror of
 * `game/HeartBeat.Game.Core/Data/Minions.cs`, for the screens that must know
 * who is standing where without booting wasm. `minions.test.ts` parses the C#
 * and fails if a constant, an id shape or a name moves there and not here.
 *
 * **They are skirmishes, not stages.** A fight with one is addressed as
 * `(island, 100 + k)`, a stage number no island has, and its id starts with `m`,
 * never the `i<island>s<stage>-` shape that `world.ts` reads progress from. So
 * beating one clears nothing, counts toward nothing, and cannot move the compass.
 * They pay a little XP once a day each and nothing else.
 *
 * Each is a shrunken copy of the island's stage 1 or stage 2 common and wears
 * its parent's sprite, drawn smaller on the board.
 */

export const MINION_STAGE_BASE = 100;
export const MINIONS_PER_ISLAND = 2;
export const MINION_FIRST_ISLAND = 5;
/** Mirrors `Progression.XpForDefeating(MonsterType.Minion)`. */
export const MINION_XP = 8;
/** Skirmishes wander stages 1 to 6; the boss stage is never crowded. */
export const MINION_LAST_STAGE = 6;

export interface Minion {
  island: number;
  /** The address a fight uses: 101 or 102. */
  stage: number;
  id: string;
  name: string;
  darkName: string;
  /** The parent's sprite, drawn small. */
  spriteKey: string;
  /** Which stage of the island it is a copy of. */
  parentStage: number;
}

export const isMinionStage = (stage: number): boolean =>
  stage > MINION_STAGE_BASE && stage <= MINION_STAGE_BASE + MINIONS_PER_ISLAND;

/** True for a monster id that is a skirmish and so must never be read as progress. */
export const isMinionId = (monsterId: string): boolean => /^m\d+k\d+-/.test(monsterId);

export function minionsFor(island: number): Minion[] {
  const view = ISLANDS.find((i) => i.number === island);
  if (!view || island < MINION_FIRST_ISLAND) return [];
  const out: Minion[] = [];
  for (let k = 1; k <= MINIONS_PER_ISLAND; k += 1) {
    const parent = view.stages[k - 1];
    if (!parent) continue;
    out.push({
      island,
      stage: MINION_STAGE_BASE + k,
      id: `m${island}k${k}-${parent.spriteKey}`,
      name: `Little ${parent.monster}`,
      darkName: `Little ${parent.darkMonster}`,
      spriteKey: parent.spriteKey,
      parentStage: k,
    });
  }
  return out;
}

/* -- where they stand --------------------------------------------------------- */

export interface Tile { x: number; y: number }

const NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const apart = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Whether the pet can still walk from the spawn to a tile beside the stage's
 * monster with `blocked` tiles standing in the way. A skirmish stops the pet
 * until it is beaten, so one standing in a gap in a hedge would wall the stage
 * off, which is exactly the arena that has such a gap.
 */
export function monsterReachable(arena: Arena, blocked: readonly Tile[]): boolean {
  const key = (t: Tile) => `${t.x},${t.y}`;
  const seen = new Set<string>([key(arena.spawn)]);
  const queue: Tile[] = [arena.spawn];
  while (queue.length) {
    const here = queue.shift()!;
    if (isAdjacentToMonster(arena, here.x, here.y)) return true;
    for (const [dx, dy] of NEIGHBOURS) {
      const next = { x: here.x + dx, y: here.y + dy };
      if (seen.has(key(next)) || !isWalkable(arena, next.x, next.y)) continue;
      if (blocked.some((b) => b.x === next.x && b.y === next.y)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return false;
}

/**
 * Where up to `count` skirmishes stand on an arena.
 *
 * Open ground near the middle, and never somewhere that could trap the walk: a
 * tile needs three open neighbours (so never a corridor), is not the spawn or
 * its neighbour, not the monster's tile or beside it (that is the stage's own
 * fight), not the partner's pedestal, and sits at least three tiles from the
 * others, and never so that the monster stops being reachable (`monsterReachable`).
 */
export function minionSpots(arena: Arena, count: number = MINIONS_PER_ISLAND): Tile[] {
  const ally = allyTile(arena);
  const middle = (ARENA_WIDTH - 1) / 2;
  const candidates: Tile[] = [];
  for (let y = 0; y < ARENA_HEIGHT; y += 1) {
    for (let x = 0; x < ARENA_WIDTH; x += 1) {
      const here = { x, y };
      if (!isWalkable(arena, x, y)) continue;
      if (apart(here, arena.spawn) <= 1 || apart(here, arena.monster) <= 1) continue;
      if (ally && x === ally.x && y === ally.y) continue;
      if (isAdjacentToMonster(arena, x, y)) continue;
      const open = NEIGHBOURS.filter(([dx, dy]) => isWalkable(arena, x + dx, y + dy)).length;
      if (open < 3) continue;
      candidates.push(here);
    }
  }
  candidates.sort((a, b) => Math.abs(a.x - middle) - Math.abs(b.x - middle) || a.y - b.y || a.x - b.x);

  const picked: Tile[] = [];
  for (const tile of candidates) {
    if (picked.length >= count) break;
    if (!picked.every((other) => apart(other, tile) >= 3)) continue;
    if (!monsterReachable(arena, [...picked, tile])) continue;
    picked.push(tile);
  }
  return picked;
}

export interface MinionOnBoard extends Minion, Tile {}

/**
 * The skirmishes standing on a stage: none before island 5 or on the boss
 * stage, and none that were beaten today.
 */
export function minionsOnStage(
  island: number,
  stage: number,
  arena: Arena,
  beatenToday: readonly string[] = [],
): MinionOnBoard[] {
  if (island < MINION_FIRST_ISLAND || stage > MINION_LAST_STAGE) return [];
  const here = minionsFor(island);
  const spots = minionSpots(arena, here.length);
  return here
    .map((minion, i) => (spots[i] ? { ...minion, ...spots[i] } : null))
    .filter((m): m is MinionOnBoard => m !== null && !beatenToday.includes(m.id));
}
