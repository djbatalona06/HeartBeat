/**
 * The files the precache leaves out on purpose, and the runtime cache that
 * keeps them once they have been fetched.
 *
 * `globIgnores` in vite.config.ts keeps Phaser, the game worker and the 3D
 * mascots out of the precache, and `globPatterns` never lists `wasm`. Each one
 * belongs to one screen, and together they are 5.3 MiB, several times the
 * precache itself. Without a runtime cache they were left to the HTTP cache,
 * which a phone may empty whenever it likes. With one, Eve's Garden, the
 * overworld and the 3D pet keep working offline after one online visit.
 *
 * The gear art and the display fonts are not in this list. They each have
 * their own route in sw.ts, and a request two routes both answer is an
 * InvalidStateError on the second `respondWith`.
 *
 * A future heavy file joins by matching `HEAVY_FILE`: name its chunk in
 * `manualChunks` and add the name here. `tools/lighthouse.mjs` counts what
 * this matches in `dist` and fails if `HEAVY_MAX_ENTRIES` stops leaving room
 * for two deploys of it.
 */
export const HEAVY_CACHE = 'heavy-assets-v1';

/**
 * 15 files today (3 chunks, 12 `.wasm`). A deploy that renames every one of
 * them leaves the old set beside the new until it is evicted, so 2 × 15 is the
 * floor and anything at it would evict the set being used. 40 leaves room for
 * a few more heavy files before this has to move.
 */
export const HEAVY_MAX_ENTRIES = 40;

export const HEAVY_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** A hashed file name under `assets/`: one of the named chunks, or any `.wasm`. */
export const HEAVY_FILE = /^(?:(?:phaser|game\.worker|mascot3d)-[^/]+\.js|[^/]+\.wasm)$/;

/** True for a heavy file served from inside `scope` (the registration scope). */
export function isHeavyAsset(url: URL, scope: string): boolean {
  const base = new URL(scope);
  if (url.origin !== base.origin) return false;
  const assets = `${base.pathname}assets/`;
  return url.pathname.startsWith(assets) && HEAVY_FILE.test(url.pathname.slice(assets.length));
}
