import { ARENA_HEIGHT, ARENA_WIDTH } from '../../domain/rpg/arena';
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
 * the precache and out of the entry's preloads.
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

function tokensFromHost(host: HTMLElement): ArenaCssTokens | null {
  const style = getComputedStyle(host);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const tokens = {
    base: read('--color-base'),
    text: read('--color-text'),
    accent: read('--color-accent'),
    success: read('--color-success'),
    danger: read('--color-danger'),
  };
  return Object.values(tokens).every(Boolean) ? tokens : null;
}

/** The baked or static floor, or null only if no usable tokens/canvas exist. */
export async function loadArenaFloor(
  host: HTMLElement,
  calm: boolean,
  themeTokens?: ArenaCssTokens,
): Promise<HTMLCanvasElement | null> {
  const colors = themeTokens ?? tokensFromHost(host);
  if (!colors) return null;
  const fallback = () => drawStaticArenaFloor(colors, ARENA_WIDTH, ARENA_HEIGHT, FLOOR_TILE_PX);
  const src = arenaModelSrc(calm, saveData(), import.meta.env.BASE_URL);
  if (!src) return fallback();
  // Set when the board has given up waiting, so a late finish never opens a
  // WebGL context beside the one Phaser is already using.
  let gaveUp = false;
  const bake = import('../pet/mascots/3d/arenaScene')
    .then(({ bakeArena }) => bakeArena({
      host,
      src,
      cols: ARENA_WIDTH,
      rows: ARENA_HEIGHT,
      tilePx: FLOOR_TILE_PX,
      themeTokens: colors,
      cancelled: () => gaveUp,
    }))
    .catch(() => null);
  const patience = new Promise<null>((resolve) => {
    window.setTimeout(() => { gaveUp = true; resolve(null); }, FLOOR_BUDGET_MS);
  });
  return (await Promise.race([bake, patience])) ?? fallback();
}
