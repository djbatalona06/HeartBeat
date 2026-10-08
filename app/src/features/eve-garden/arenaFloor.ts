import { ARENA_HEIGHT, ARENA_WIDTH } from '../../domain/rpg/arena';

/**
 * The 3D checkerboard under the battle board: where its file is, and how to get
 * it as a picture without ever loading three.js on a phone that should not.
 *
 * Calm, reduced motion and Save-Data get **no request at all** -- not a still
 * frame -- the same promise the home screen's 3D tree makes (`gardenModelSrc`).
 * Anything that goes wrong (no WebGL, offline before the lazy chunk has ever
 * been fetched, a slow phone) resolves to null and the scene keeps the pixel
 * tiles it has always drawn, so the fight never waits on a floor.
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

/** The baked floor, or null. Never rejects, and never takes longer than `FLOOR_BUDGET_MS`. */
export async function loadArenaFloor(host: HTMLElement, calm: boolean): Promise<HTMLCanvasElement | null> {
  const src = arenaModelSrc(calm, saveData(), import.meta.env.BASE_URL);
  if (!src) return null;
  // Set when the board has given up waiting, so a late finish never opens a
  // WebGL context beside the one Phaser is already using.
  let gaveUp = false;
  const bake = import('../pet/mascots/3d/arenaScene')
    .then(({ bakeArena }) => bakeArena({
      host, src, cols: ARENA_WIDTH, rows: ARENA_HEIGHT, tilePx: FLOOR_TILE_PX, cancelled: () => gaveUp,
    }))
    .catch(() => null);
  const patience = new Promise<null>((resolve) => {
    window.setTimeout(() => { gaveUp = true; resolve(null); }, FLOOR_BUDGET_MS);
  });
  return Promise.race([bake, patience]);
}
