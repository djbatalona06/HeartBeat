import { cirrus } from './cirrus';
import { foxglove } from './foxglove';
import { marigold } from './marigold';
import { mochi } from './mochi';
import { wishbell } from './wishbell';
import type { Paint, Rig } from './rig';

/**
 * One builder per theme id, beside `ART` in `../index.ts` and keyed the same
 * way. A theme with no model here keeps its SVG, which is how the roster moves
 * over one mascot at a time without the others ever going blank.
 */
export const MODELS: Record<string, (paint: Paint) => Rig> = {
  kitty: mochi,
  sponge: marigold,
  shinobi: foxglove,
  avatar: cirrus,
  pony: wishbell,
};

/**
 * Falls back the way `getMascot` does: an unknown id still gets a pet.
 *
 * To Mochi by name rather than through `FALLBACK_MASCOT_ID`, and that is about
 * bundling, not taste. Everything under `3d/` shares one lazy chunk, and Rollup
 * pulls a manual chunk's plain dependencies in with it — so a value import of
 * `../roster` moved the roster into the 3D chunk, the entry chunk then imported
 * it from there, and three.js was modulepreloaded on every boot. Type imports
 * are fine; values from outside `3d/` are not. `models.test.ts` holds this
 * fallback to the roster's, and `lighthouse.mjs` fails a build that preloads.
 */
export function buildMascot(themeId: string, paint: Paint): Rig {
  return (MODELS[themeId] ?? mochi)(paint);
}
