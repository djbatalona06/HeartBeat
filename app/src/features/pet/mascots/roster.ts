import type { Pet } from '../../../domain/types';

/**
 * Who the five mascots are — names and one-liners, kept apart from the drawings
 * so a plain node test can read them.
 *
 * **None of these is anyone else's character.** The themes are named after
 * shows because a palette label may be (see NOTICE.md), but a character you
 * live with on your home screen is a much stronger claim than a palette label,
 * so every mascot here is an original: original geometry, drawn from code, and
 * an original name. Each one belongs to its theme's *spirit and palette* — a
 * lilac unicorn under the pony palette, an ink fox under the shinobi one — and
 * to nothing more specific than that. The precedent is the Ribbon Cat in
 * `domain/rpg/pets.ts`, which is this repository's own mark named for itself.
 */

export type MascotMood = Pet['mood'];

export interface MascotIdentity {
  /** Its own name. Warm, short, and nobody else's. */
  name: string;
  /** What it is, in two or three words. */
  species: string;
  /** One line, shown under the pet's level. */
  blurb: string;
}

/** Keyed by `Theme.id`. Keys must stay in step with `themes/index.ts`. */
export const MASCOT_ROSTER: Record<string, MascotIdentity> = {
  kitty: {
    name: 'Mochi',
    species: 'ribbon cat',
    blurb: 'Sits very still and expects to be admired for it.',
  },
  sponge: {
    name: 'Marigold',
    species: 'sea sponge',
    blurb: 'Full of holes, full of seawater, entirely unbothered.',
  },
  shinobi: {
    name: 'Foxglove',
    species: 'ink fox',
    blurb: 'Trains at dawn. Naps immediately afterwards.',
  },
  avatar: {
    name: 'Cirrus',
    species: 'cloud serpent',
    blurb: 'Rides the high wind and comes back down for snacks.',
  },
  pony: {
    name: 'Wishbell',
    species: 'lilac unicorn',
    blurb: 'Keeps one wish spare, in case the day needs it.',
  },
};

/** The theme the app falls back to, so the mascot falls back with it. */
export const FALLBACK_MASCOT_ID = 'kitty';

export function mascotIdentity(themeId: string): MascotIdentity {
  return MASCOT_ROSTER[themeId] ?? MASCOT_ROSTER[FALLBACK_MASCOT_ID];
}
