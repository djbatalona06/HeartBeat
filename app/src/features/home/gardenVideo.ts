/**
 * Which looping garden film belongs to which theme.
 *
 * Keyed by theme id, not by name: the Deep Sea clip is `avatar`'s, because that
 * is what the pack is called in `themes/packs/avatar.tsx`. `gardenVideo.test.ts`
 * fails if a theme has no clip, a clip has no theme, or a file is missing from
 * `public/`.
 */
export const GARDEN_VIDEO_FILES = {
  kitty: '01-kitty-garden.mp4',
  sponge: '02-sponge-garden.mp4',
  shinobi: '03-shinobi-garden.mp4',
  avatar: '04-deep-sea-garden.mp4',
  pony: '05-pony-garden.mp4',
} as const;

/**
 * Where the clip is served from, or null when the home screen should keep the
 * drawn garden.
 *
 * Both palettes get the film. An earlier version limited it to dark, on the
 * worry that a night scene behind a light page was unproven; the cost was that
 * any phone on an automatic day/night schedule saw no film for half the day and
 * reported it as broken. In light mode the veil is the light scrim, so the words
 * on top still sit on a pale wash — see `home.css` for the readability check.
 * Calm and reduced motion get nothing at all — not a paused film, no request —
 * because those switches mean no motion and no extra download.
 *
 * `base` is Vite's `BASE_URL` (always ends in a slash), so the clip resolves
 * when the app is served from a sub-path.
 */
export function gardenVideoSrc(
  themeId: string,
  calm: boolean,
  base: string,
): string | null {
  if (calm) return null;
  const file = (GARDEN_VIDEO_FILES as Record<string, string>)[themeId];
  return file ? `${base}media/heartbeat-gardens/${file}` : null;
}
