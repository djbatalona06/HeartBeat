/**
 * The lazy entry for the gear drawings.
 *
 * `GearIcon` reaches the registry only through `import('./gear-art')`, so every
 * drawing lands in one chunk, `assets/gear-art-<hash>.js`, named after this
 * file. The chunk is kept out of the precache (see `globIgnores` in
 * vite.config.ts) and cached at runtime by `pwa/sw.ts` instead. This file is
 * the whole of the chunk's public surface: nothing else under `src/` may import
 * `art/gear` at runtime, and `gearArt.test.ts` fails if something does.
 */
export { gearArt } from './index';
