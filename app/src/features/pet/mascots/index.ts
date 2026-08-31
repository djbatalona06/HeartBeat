import type { ComponentType } from 'react';
import { Cirrus } from './Cirrus';
import { Foxglove } from './Foxglove';
import { Marigold } from './Marigold';
import { Mochi } from './Mochi';
import { Wishbell } from './Wishbell';
import { FALLBACK_MASCOT_ID, MASCOT_ROSTER, type MascotIdentity, type MascotMood } from './roster';

/**
 * The mascot registry — one original character per theme, keyed by `Theme.id`.
 *
 * Deliberately a registry beside the theme engine rather than a field on
 * `Theme`. A theme is a palette; a mascot is a drawing that only the home
 * screen shows. Hanging one off the other would put a React component in every
 * pack and make the token tests care about artwork, which is a lot of coupling
 * to buy one lookup.
 *
 * The lookup falls back the same way `getTheme` does, so an unknown id — an
 * old value left in `localStorage`, say — still gets a pet rather than a hole.
 */

export interface MascotProps {
  mood: MascotMood;
}

export interface Mascot extends MascotIdentity {
  Art: ComponentType<MascotProps>;
}

const ART: Record<string, ComponentType<MascotProps>> = {
  kitty: Mochi,
  sponge: Marigold,
  shinobi: Foxglove,
  avatar: Cirrus,
  pony: Wishbell,
};

/**
 * Built by walking the roster, not the drawings, and skipping any entry that is
 * missing either half. A theme with a drawing but no name would otherwise
 * render `undefined the undefined` into the pet card and the label, which is
 * exactly the kind of hole a fallback exists to prevent.
 */
const MASCOTS: Record<string, Mascot> = Object.fromEntries(
  Object.entries(MASCOT_ROSTER)
    .filter(([id]) => id in ART)
    .map(([id, identity]) => [id, { ...identity, Art: ART[id] }]),
);

export function getMascot(themeId: string): Mascot {
  return MASCOTS[themeId] ?? MASCOTS[FALLBACK_MASCOT_ID];
}

export { MASCOT_ROSTER, FALLBACK_MASCOT_ID } from './roster';
export type { MascotIdentity, MascotMood } from './roster';
