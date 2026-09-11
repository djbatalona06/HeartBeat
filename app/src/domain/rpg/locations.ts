import type { Verdict } from './shop';

/**
 * Places to send the bird, and what it brings back.
 *
 * Adventures already existed: `startAdventure` spent energy per
 * `adventureCost` and bonded the companion, and that was the whole of it —
 * every adventure was the same adventure. What was missing was anywhere to go,
 * which is what makes a second one worth doing.
 *
 * Locations unlock by level rather than by purchase. Coins already have three
 * things to buy; what a level has never bought is anything at all, so this is
 * the reward for the levelling curve rather than another drain on the same
 * purse. Distance costs energy on top of the stage's own cost, so the far
 * places are a choice made on a good day rather than the obvious one always.
 */

export interface Place {
  /** Recorded in `Avatar.visited` and prefixed like the other catalogues. */
  id: string;
  name: string;
  blurb: string;
  /** The level this opens at. The first is 1, so there is always somewhere. */
  unlockLevel: number;
  /** Energy on top of `adventureCost` — distance, in other words. */
  surcharge: number;
  /** Coins for arriving somewhere new. Paid once, on the first visit only. */
  bounty: number;
  /**
   * What the bird might come home with. Flavour rather than an item: a
   * souvenir table would need a fourth catalogue, a fourth art registry and a
   * fourth thing to carry forever, to say something a sentence already says.
   */
  finds: readonly string[];
}

export const PLACE_PREFIX = 'place-';

export const PLACES: readonly Place[] = [
  {
    id: 'place-garden',
    name: 'The garden',
    blurb: 'Out the window and back before lunch.',
    unlockLevel: 1,
    surcharge: 0,
    bounty: 10,
    finds: [
      'a bottle cap, polished by rain',
      'one very good stick',
      'a feather that is not theirs',
      'three seeds and an opinion',
    ],
  },
  {
    id: 'place-canal',
    name: 'The canal',
    blurb: 'Slow water, and things floating in it that are worth a look.',
    unlockLevel: 3,
    surcharge: 2,
    bounty: 20,
    finds: [
      'a smooth green pebble',
      'half a ticket to something',
      'a reed, carried the whole way home',
      'the exact sound a moorhen makes',
    ],
  },
  {
    id: 'place-night-market',
    name: 'The night market',
    blurb: 'Loud, warm, and full of dropped food.',
    unlockLevel: 5,
    surcharge: 4,
    bounty: 35,
    finds: [
      'a paper lantern, slightly singed',
      'a coin from somewhere else',
      'a strong opinion about dumplings',
      'a bell off a stall awning',
    ],
  },
  {
    id: 'place-pine-ridge',
    name: 'Pine ridge',
    blurb: 'Up where the air goes thin and the view goes wide.',
    unlockLevel: 8,
    surcharge: 6,
    bounty: 55,
    finds: [
      'a cone the size of its own head',
      'frost, briefly',
      'a view it cannot describe',
      'resin stuck to one foot',
    ],
  },
  {
    id: 'place-lighthouse',
    name: 'The lighthouse',
    blurb: 'A long way out, and the light is on for somebody.',
    unlockLevel: 12,
    surcharge: 9,
    bounty: 80,
    finds: [
      'a scrap of chart, mostly sea',
      'sea glass worn to a coin',
      'the keeper’s spare button',
      'salt in every feather',
    ],
  },
  {
    id: 'place-observatory',
    name: 'The observatory',
    blurb: 'Somebody left the dome open. The bird took this as an invitation.',
    unlockLevel: 16,
    surcharge: 12,
    bounty: 120,
    finds: [
      'a star chart, upside down',
      'a lens cap nobody will miss',
      'the name of one new constellation',
      'a very long night, well spent',
    ],
  },
];

const BY_ID = new Map(PLACES.map((p) => [p.id, p]));

export function placeById(id: string | undefined): Place | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Everywhere open at this level, nearest first. */
export function placesFor(level: number): Place[] {
  return PLACES.filter((p) => p.unlockLevel <= level);
}

/** The next one to look forward to, or null once everywhere is open. */
export function nextPlace(level: number): Place | null {
  return PLACES.find((p) => p.unlockLevel > level) ?? null;
}

/**
 * Whether the bird can set off — level first, then energy.
 *
 * Level before energy on purpose: "come back at level 5" is a different answer
 * from "come back with more energy", and telling somebody to rest up for
 * somewhere they cannot go yet would waste the rest.
 */
export function canTravel(place: Place, level: number, energy: number, baseCost: number): Verdict {
  if (level < place.unlockLevel) {
    return { ok: false, reason: `Opens at level ${place.unlockLevel}.` };
  }
  const total = baseCost + place.surcharge;
  if (energy < total) return { ok: false, reason: `${total - energy} more energy to get there.` };
  return { ok: true };
}

/** Total energy for a trip: the stage's own cost, plus the distance. */
export function travelCost(place: Place, baseCost: number): number {
  return baseCost + place.surcharge;
}

/**
 * What came home.
 *
 * `roll` is supplied by the caller rather than drawn here, the same rule
 * `domain/rpg/pets.ts` already follows for drops: this module stays pure, so
 * the test can name the outcome instead of running the function two hundred
 * times and hoping. Anything outside 0–1 is clamped rather than throwing,
 * because the one caller is a UI passing `Math.random()` and a crash on an
 * adventure would be a strange way to find out about a rounding error.
 */
export function findAt(place: Place, roll: number): string {
  const safe = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0;
  return place.finds[Math.floor(safe * place.finds.length)];
}

/** First time here? The bounty is paid once, so this is what decides it. */
export function isNewTo(visited: readonly string[] | undefined, placeId: string): boolean {
  return !(visited ?? []).includes(placeId);
}
