import { avatarTheme } from './packs/avatar';
import { kittyTheme } from './packs/kitty';
import { ponyTheme } from './packs/pony';
import { shinobiTheme } from './packs/shinobi';
import { spongeTheme } from './packs/sponge';
import type { Theme } from './types';

/**
 * The theme registry. A new theme is added here and nowhere else — the engine,
 * the picker and the CSS variables all read from this list.
 */
export const THEMES: Theme[] = [kittyTheme, spongeTheme, shinobiTheme, avatarTheme, ponyTheme];

export const DEFAULT_THEME_ID = kittyTheme.id;

export function getTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? kittyTheme;
}

export type { Theme, BackdropProps } from './types';
export { themeToCssVars, applyTheme, contrast } from './tokens';
