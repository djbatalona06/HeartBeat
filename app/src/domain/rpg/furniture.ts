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

/* -- furnishing itself ------------------------------------------------------- */

/**
 * Which of two pieces in the same slot is the better one.
 *
 * **Highest price, then catalogue order.** Nothing in the codebase answered
 * this before, so it is a decision being made here rather than a rule being
 * restated.
 *
 * It reads as though it should be "highest tier, then highest price", since
 * the tier ladder is what everything ownable lands on. It does not need to be:
 * furniture takes its rung from its price through `tierForPrice`, which walks
 * the ladder picking the highest rung the price reaches, and is therefore
 * **monotonic in price**. A dearer piece can never be a lower tier, so the two
 * orders are the same order and naming price alone is the shorter way to say
 * it — and it keeps this module from importing `raidStats.ts`, which imports
 * `HouseSlot` back from here.
 *
 * Catalogue order breaks the last tie, so the answer is total: two pieces at
 * the same price still resolve, and they resolve the same way on both phones.
 *
 * Returns a number in the sort-comparator sense: negative when `a` is worse.
 */
export function compareFurniture(a: Furniture, b: Furniture): number {
  if (a.price !== b.price) return a.price - b.price;
  return FURNITURE.indexOf(b) - FURNITURE.indexOf(a);
}

/** The best piece for one slot out of a set of owned ids, if any. */
export function bestForSlot(
  ownedIds: Iterable<string>,
  slot: HouseSlot,
): Furniture | undefined {
  const owned = new Set(ownedIds);
  let best: Furniture | undefined;
  for (const piece of furnitureForSlot(slot)) {
    if (!owned.has(piece.id)) continue;
    if (!best || compareFurniture(piece, best) > 0) best = piece;
  }
  return best;
}

/**
 * The room somebody's furniture makes, with no placing involved.
 *
 * The house used to be arranged by hand: four rows of chips, a Bare option and
 * two pieces each, and copy telling you that rearranging it changed what you
 * both saw. That is gone. A room you furnish by buying furniture is a room
 * that rewards the thing you actually did, and a placement UI for four slots
 * with two options each is twelve controls answering a question nobody was
 * really asking.
 *
 * **What auto-placement can and cannot decide.** Every furniture drawing uses
 * absolute coordinates in one shared 100×100 space — `RainyWindow` is at
 * x=58, y=18 and nothing else can be — so this chooses *which* piece stands in
 * each slot and never *where*. Varying position would mean rewriting all eight
 * drawings to be position-agnostic inside a `<g transform>`, which is a
 * different change.
 */
export function houseFrom(ownedIds: Iterable<string>): House {
  const owned = new Set(ownedIds);
  const out: House = {};
  for (const slot of HOUSE_SLOTS) {
    const best = bestForSlot(owned, slot);
    if (best) out[slot] = best.id;
  }
  return out;
}

/**
 * The stored room, brought up to date by one member's furniture.
 *
 * Upgrades only, per slot, and that is what makes it safe. `Pet.house` is
 * **couple-level** — it rides the shared pet row — while `inventory` is
 * per-member and is not partner-visible, so each phone can only ever see half
 * of what the couple owns. Recomputing the room from one member's inventory
 * and storing the result would delete whatever the other had furnished with,
 * and then the two phones would take turns deleting each other's work.
 *
 * Taking the better of the two per slot removes that entirely: the room only
 * ever improves, every write is idempotent, and the order the two phones sync
 * in stops mattering. It is the same shape as the XP ledger being reconciled
 * rather than last-write-wins, and for the same reason.
 */
export function refurnish(stored: House | undefined, ownedIds: Iterable<string>): House {
  const current = normalizeHouse(stored);
  const mine = houseFrom(ownedIds);
  const out: House = { ...current };
  for (const slot of HOUSE_SLOTS) {
    const candidate = furnitureById(mine[slot]);
    if (!candidate) continue;
    const held = furnitureById(current[slot]);
    if (!held || compareFurniture(candidate, held) > 0) out[slot] = candidate.id;
  }
  return out;
}
