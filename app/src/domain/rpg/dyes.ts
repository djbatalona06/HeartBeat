/**
 * Colourways for the birb.
 *
 * Every mascot in `features/pet/mascots/` paints in exactly three custom
 * properties — `--color-text`, `--color-accent`, `--color-text-muted` — and
 * nothing else. So a dye is those three values, set on the wrapper the mascot
 * sits in, and the five drawings never learn that dyes exist: no prop
 * threading, no edits to the art, and a dye works on a mascot drawn after it.
 *
 * These carry literal colours, which is the opposite of the rule the areas grid
 * follows — and deliberately. An area tile is chrome, so it tints off
 * `--color-accent` and belongs to whichever theme pack is on. A dye is the
 * thing being chosen. "Make my bird teal" has no meaning if the teal is really
 * whatever the current pack's accent happens to be, and re-theming would then
 * silently repaint a bird somebody picked on purpose.
 *
 * What that costs is a legibility duty the theme engine normally handles, so
 * `dyes.test.ts` runs every dye against every pack's page base with the same
 * `contrast()` the palette tests use. A dye that vanishes on one of the five
 * packs cannot land.
 */

export interface Dye {
  /** Stored on `Avatar.dye` and prefixed in the inventory — see `DYE_PREFIX`. */
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Replaces `--color-text`: the body, and most of the bird. */
  ink: string;
  /** Replaces `--color-accent`: the inner ear, the cheeks, the small warm bits. */
  accent: string;
  /** Replaces `--color-text-muted`: shadow and outline. */
  muted: string;
}

/**
 * Inventory rows are one generic table keyed by a catalogue string, shared with
 * gear. The prefix is what keeps three catalogues from colliding in it without
 * adding a `kind` column and a migration to carry it.
 */
export const DYE_PREFIX = 'dye-';

/**
 * Eight, at three prices. Everything here is a mid-tone on purpose: the packs
 * run from near-black to near-white behind the bird, so a dye at either
 * extreme is legible on some of them and a silhouette on the rest.
 */
export const DYES: readonly Dye[] = [
  {
    id: 'dye-house-sparrow',
    name: 'House sparrow',
    blurb: 'The one you started as. Costs nothing, and always will.',
    price: 0,
    ink: '#b08968',
    accent: '#e8b298',
    muted: '#7f6a55',
  },
  {
    id: 'dye-tidepool',
    name: 'Tidepool',
    blurb: 'Green where the light hits, blue where it does not.',
    price: 60,
    ink: '#4a9d9c',
    accent: '#8fd9c4',
    muted: '#37716f',
  },
  {
    id: 'dye-plum',
    name: 'Plum',
    blurb: 'Deep and a little smug about it.',
    price: 60,
    ink: '#8f6fa8',
    accent: '#d5a8dd',
    muted: '#6a5180',
  },
  {
    id: 'dye-marmalade',
    name: 'Marmalade',
    blurb: 'Breakfast, as a bird.',
    price: 90,
    ink: '#d98b4a',
    accent: '#f5c27d',
    muted: '#a5673a',
  },
  {
    id: 'dye-moss',
    name: 'Moss',
    blurb: 'The colour of the north side of everything.',
    price: 90,
    ink: '#7a9b65',
    accent: '#bcd9a0',
    muted: '#5c7449',
  },
  {
    id: 'dye-slate-dove',
    name: 'Slate dove',
    blurb: 'Quiet, and very hard to argue with.',
    price: 90,
    ink: '#8f97a8',
    accent: '#c6cdd9',
    muted: '#6b7280',
  },
  {
    id: 'dye-rosefinch',
    name: 'Rosefinch',
    blurb: 'Pink that has been outside.',
    price: 150,
    ink: '#d97a8c',
    accent: '#f5b3bf',
    muted: '#a55b6a',
  },
  {
    id: 'dye-goldcrest',
    name: 'Goldcrest',
    blurb: 'A small bird with a very high opinion of its own hat.',
    price: 150,
    ink: '#c9a227',
    accent: '#f2dc84',
    muted: '#8f7420',
  },
];

const BY_ID = new Map(DYES.map((d) => [d.id, d]));

export function dyeById(id: string | undefined): Dye | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** The one every bird starts wearing, and the one a cleared dye falls back to. */
export const DEFAULT_DYE_ID = 'dye-house-sparrow';

/**
 * What to put on the wrapper element. Returns nothing at all for the starter
 * dye, so an untouched bird inherits the pack exactly as it always did rather
 * than being pinned to a brown that merely looks like the default on one theme.
 */
export function dyeStyle(id: string | undefined): Record<string, string> {
  const dye = dyeById(id);
  if (!dye || dye.id === DEFAULT_DYE_ID) return {};
  return {
    '--color-text': dye.ink,
    '--color-accent': dye.accent,
    '--color-text-muted': dye.muted,
  };
}
