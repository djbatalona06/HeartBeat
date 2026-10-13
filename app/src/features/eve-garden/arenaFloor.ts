import { ARENA_HEIGHT, ARENA_WIDTH, tileKindAt, type Arena } from '../../domain/rpg/arena';
import { drawStaticArenaFloor } from './arenaCanvas';
import type { ArenaCssTokens } from '../pet/mascots/3d/arenaPalette';

/**
 * The 3D checkerboard under the battle board: where its file is, and how to get
 * it as a picture without ever loading three.js on a phone that should not.
 *
 * Calm, reduced motion and Save-Data get **no request at all** and use a static
 * Canvas 2D floor in the selected pet's palette. Any 3D failure uses that same
 * static fallback, so the fight never waits on a floor or opens WebGL twice.
 * The old pixel tiles remain the last-resort fallback if Canvas 2D is absent.
 *
 * Made by `tools/arena-glb.mjs`. The three.js side is reached through a dynamic
 * `import()` only: that is what keeps it in the lazy `mascot3d` chunk, out of
 * the precache and out of the entry's preloads. The static floor's colour maths
 * comes from the three-free `arena-paint` chunk, so importing it here does not
 * pull three.js in; `arenaChunk.test.ts` and `lighthouse.mjs` hold that line.
 */

export const ARENA_MODEL_FILE = 'arena.glb';

/** Pixels per tile in the baked picture. Twice the sprite grid's 3x scale would be wasted on a floor. */
export const FLOOR_TILE_PX = 64;

/** How long the board waits for the floor before starting without it. */
export const FLOOR_BUDGET_MS = 1500;

export function arenaModelSrc(calm: boolean, saveData: boolean, base: string): string | null {
  return calm || saveData ? null : `${base}media/heartbeat-gardens/${ARENA_MODEL_FILE}`;
}

function saveData(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData === true;
}

/**
 * The few boards kept. A baked board is decided by the companion's colours *and*
 * the stage's layout, so there are more of them than there used to be floors;
 * eight covers walking back and forth across a handful of stages in both modes.
 */
export const FLOOR_CACHE_MAX = 8;

/** A floor is fully decided by the five tokens it is painted from. */
export function floorCacheKey(tokens: ArenaCssTokens): string {
  return [tokens.base, tokens.text, tokens.accent, tokens.success, tokens.danger].join('|');
}

/** What stands in each cell of a stage, by sprite name, read through the one grid reader movement uses. */
export function arenaLayout(arena: Arena): (string | undefined)[][] {
  return Array.from({ length: ARENA_HEIGHT }, (_, y) =>
    Array.from({ length: ARENA_WIDTH }, (_, x) => tileKindAt(arena, x, y)?.sprite));
}

/** A baked board is decided by its five colours and by which stage's layout stands on it. */
export function boardCacheKey(tokens: ArenaCssTokens, arena: Arena): string {
  return `${floorCacheKey(tokens)}#${arena.rows.join('/')}`;
}

/** Oldest out first. Re-remembering a key moves it to the back. */
export function remember<T>(cache: Map<string, T>, key: string, value: T, max = FLOOR_CACHE_MAX): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > max) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Baked boards only. A static floor is a few milliseconds of 2D drawing, and a
 * failed bake is not remembered, so a transient failure does not stick.
 *
 * Without this every stage clear rebuilt the scene and baked again: a glTF
 * parse, a WebGL context made and force-lost, and a readback, for a picture that
 * depends only on the companion, the light/dark mode and the stage's layout.
 */
const baked = new Map<string, HTMLCanvasElement>();

/**
 * The baked or static floor, or null only if no usable canvas exists.
 *
 * `themeTokens` are the selected companion's, never read off the DOM: the page
 * wears the *app's* theme, and a floor drawn from that would quietly change
 * pack. `cancelled` is asked before the GPU is touched, so a bake that was
 * started for a scene that has since been torn down does not open a WebGL
 * context beside the one Phaser is using.
 */
export async function loadArenaFloor(
  calm: boolean,
  themeTokens: ArenaCssTokens,
  arena: Arena,
  cancelled: () => boolean = () => false,
): Promise<HTMLCanvasElement | null> {
  const fallback = () => drawStaticArenaFloor(themeTokens, ARENA_WIDTH, ARENA_HEIGHT, FLOOR_TILE_PX);
  const src = arenaModelSrc(calm, saveData(), import.meta.env.BASE_URL);
  if (!src) return fallback();

  const key = boardCacheKey(themeTokens, arena);
  const known = baked.get(key);
  if (known) {
    remember(baked, key, known);
    return known;
  }

  // Set when the board has given up waiting, so a late finish never opens a
  // WebGL context beside the one Phaser is already using.
  let gaveUp = false;
  let timer: number | undefined;
  const bake = import('../pet/mascots/3d/arenaScene')
    .then(({ bakeArena }) => bakeArena({
      src,
      cols: ARENA_WIDTH,
      rows: ARENA_HEIGHT,
      tilePx: FLOOR_TILE_PX,
      themeTokens,
      layout: arenaLayout(arena),
      cancelled: () => gaveUp || cancelled(),
    }))
    .catch(() => null);
  const patience = new Promise<null>((resolve) => {
    timer = window.setTimeout(() => { gaveUp = true; resolve(null); }, FLOOR_BUDGET_MS);
  });
  const result = await Promise.race([bake, patience]);
  window.clearTimeout(timer);
  if (result?.dataset.arena3d === 'true') remember(baked, key, result);
  return result ?? fallback();
}
