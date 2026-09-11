/**
 * The birbhouse: four places to put something, and the things to put there.
 *
 * The house is the **couple's**, not a member's — it hangs off the shared `pet`
 * row rather than either `Avatar`. That is the one real decision in this file
 * and it follows the shape of the app: the pet is the thing the two of you keep
 * together, so the house it lives in is too. Dyes went the other way because
 * you dress your own bird; you do not each get a different living room.
 *
 * Consequences worth stating, because they are features rather than
 * limitations. Either partner can rearrange it, and it changes for both — the
 * same as the calendar and the pet's own XP. And a piece bought by one of you
 * is placed into a house both of you see, which is the point of buying it.
 */

export type HouseSlot = 'perch' | 'wall' | 'floor' | 'window';

/**
 * Drawing order, back to front — and the bird is drawn after all of them.
 *
 * Everything in the room sits behind the character, which is the rule the first
 * attempt got wrong: with the perch layer in front, the birch branch was drawn
 * straight across the bird's face, and a rug in front covered the feet standing
 * on it. The bird is the subject and the room is its backdrop, so the only
 * ordering that matters is among the pieces themselves: the window is a hole in
 * the far wall, things hang on the wall in front of it, the floor is nearer
 * still, and a perch stands in front of the lot.
 */
export const HOUSE_SLOTS: readonly HouseSlot[] = ['window', 'wall', 'floor', 'perch'];

export const HOUSE_SLOT_NAMES: Record<HouseSlot, string> = {
  window: 'Window',
  wall: 'Wall',
  floor: 'Floor',
  perch: 'Perch',
};

export interface Furniture {
  /** Stored in `Pet.house` and prefixed in the inventory — see `DECOR_PREFIX`. */
  id: string;
  name: string;
  blurb: string;
  slot: HouseSlot;
  price: number;
}

/** Keeps decor from colliding with gear and dyes in the one `inventory` table. */
export const DECOR_PREFIX = 'decor-';

/**
 * Two per slot, plus the bare option that is always available.
 *
 * Priced above dyes on purpose: a colourway is a change you see every time the
 * bird is on screen, and a cushion is a change you see when you visit. The more
 * often a thing is looked at, the cheaper it should be to reach.
 */
export const FURNITURE: readonly Furniture[] = [
  {
    id: 'decor-window-rain',
    name: 'Rainy window',
    blurb: 'Weather, happening safely on the other side of the glass.',
    slot: 'window',
    price: 120,
  },
  {
    id: 'decor-window-moon',
    name: 'Moon window',
    blurb: 'For the nights somebody is up later than they meant to be.',
    slot: 'window',
    price: 180,
  },
  {
    id: 'decor-wall-garland',
    name: 'Paper garland',
    blurb: 'Strung up for something, and never taken down.',
    slot: 'wall',
    price: 120,
  },
  {
    id: 'decor-wall-shelf',
    name: 'Little shelf',
    blurb: 'Three things on it, none of them useful.',
    slot: 'wall',
    price: 180,
  },
  {
    id: 'decor-floor-rug',
    name: 'Round rug',
    blurb: 'Warm underfoot. Somewhat shed on.',
    slot: 'floor',
    price: 120,
  },
  {
    id: 'decor-floor-plant',
    name: 'Houseplant',
    blurb: 'Still alive, which is the whole achievement.',
    slot: 'floor',
    price: 180,
  },
  {
    id: 'decor-perch-swing',
    name: 'Swing',
    blurb: 'A perch that gives a little, which is the good kind.',
    slot: 'perch',
    price: 120,
  },
  {
    id: 'decor-perch-branch',
    name: 'Birch branch',
    blurb: 'Brought in from outside and never explained.',
    slot: 'perch',
    price: 180,
  },
];

const BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));

export function furnitureById(id: string | undefined): Furniture | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function furnitureForSlot(slot: HouseSlot): Furniture[] {
  return FURNITURE.filter((f) => f.slot === slot);
}

/** What is placed where. An empty slot is simply absent. */
export type House = Partial<Record<HouseSlot, string>>;

/**
 * Drop a stored house to only what is still real.
 *
 * Two things it throws away, and both of them happen. A piece retired from the
 * catalogue in a later version is still written in somebody's saved house; and
 * a piece whose id is stored under the wrong slot would otherwise be drawn in
 * the wrong layer — a rug hung on the wall. Reading through this means neither
 * reaches the scene.
 */
export function normalizeHouse(house: House | undefined): House {
  const out: House = {};
  if (!house) return out;
  for (const slot of HOUSE_SLOTS) {
    const item = furnitureById(house[slot]);
    if (item && item.slot === slot) out[slot] = item.id;
  }
  return out;
}

/**
 * Put something in its slot, or clear that slot with `undefined`.
 *
 * Pure, and takes the slot from the item rather than the caller — a piece
 * belongs to exactly one slot, so letting a caller name a different one is only
 * a way to be wrong.
 */
export function placeIn(house: House | undefined, itemId: string | undefined): House {
  const next = normalizeHouse(house);
  if (!itemId) return next;
  const item = furnitureById(itemId);
  if (!item) return next;
  next[item.slot] = item.id;
  return next;
}

export function clearSlot(house: House | undefined, slot: HouseSlot): House {
  const next = normalizeHouse(house);
  delete next[slot];
  return next;
}
