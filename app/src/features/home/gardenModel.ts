/**
 * Where the home garden's 3D tree is served from, or null when the home screen
 * should keep the drawn garden.
 *
 * One model for every theme: the file names its materials by role (`leaf`,
 * `trunk`, …) and `mascots/3d/gardenScene.ts` paints them from the pack in
 * front of it, so there is no per-theme file to forget to add. Made by
 * `tools/garden-glb.mjs`.
 *
 * Calm and reduced motion get nothing at all — not a still frame, no request —
 * because those switches mean no motion and no extra download.
 *
 * `base` is Vite's `BASE_URL` (always ends in a slash), so the file resolves
 * when the app is served from a sub-path.
 */
export const GARDEN_MODEL_FILE = 'garden.glb';

export function gardenModelSrc(calm: boolean, base: string): string | null {
  return calm ? null : `${base}media/heartbeat-gardens/${GARDEN_MODEL_FILE}`;
}
