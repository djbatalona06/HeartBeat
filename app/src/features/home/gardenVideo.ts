import type { ThemeMode } from '../../themes/types';

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
 * The films are night scenes, so they only stand in for the garden in the dark
 * palette; a light page behind a dark film would be the one case the veil's
 * contrast proof (`themes/veil.test.ts`) never modelled. Calm and reduced
 * motion get nothing at all — not a paused film, no request — because the
 * brief is that those switches mean no motion and no extra download.
 *
 * `base` is Vite's `BASE_URL` (always ends in a slash), so the clip resolves
 * when the app is served from a sub-path.
 */
export function gardenVideoSrc(
  themeId: string,
  mode: ThemeMode,
  calm: boolean,
  base: string,
): string | null {
  if (calm || mode !== 'dark') return null;
  const file = (GARDEN_VIDEO_FILES as Record<string, string>)[themeId];
  return file ? `${base}media/heartbeat-gardens/${file}` : null;
}
