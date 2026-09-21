import { describe, expect, it } from 'vitest';
import {
  DECOR_PREFIX,
  FURNITURE,
  HOUSE_SLOTS,
  HOUSE_SLOT_NAMES,
  bestForSlot,
  compareFurniture,
  furnitureById,
  furnitureForSlot,
  houseFrom,
  normalizeHouse,
  refurnish,
  type House,
} from './furniture';
import { tierForPrice } from './raidStats';
import { tierRank } from './tiers';

describe('the furniture catalogue', () => {
  it('repeats no id and no name', () => {
    expect(new Set(FURNITURE.map((f) => f.id)).size).toBe(FURNITURE.length);
    expect(new Set(FURNITURE.map((f) => f.name)).size).toBe(FURNITURE.length);
  });

  it('prefixes every id, so decor cannot collide with gear or dyes', () => {
    for (const item of FURNITURE) expect(item.id, item.name).toMatch(new RegExp(`^${DECOR_PREFIX}`));
  });

  it('files every piece under a real slot, and names every slot', () => {
    for (const item of FURNITURE) expect(HOUSE_SLOTS, item.id).toContain(item.slot);
    for (const slot of HOUSE_SLOTS) expect(HOUSE_SLOT_NAMES[slot], slot).toBeTruthy();
  });

  it('leaves no slot with nothing to put in it', () => {
    for (const slot of HOUSE_SLOTS) {
      expect(furnitureForSlot(slot).length, slot).toBeGreaterThanOrEqual(2);
    }
  });

  it('charges for everything, because the room starts bare rather than free', () => {
    for (const item of FURNITURE) expect(item.price, item.id).toBeGreaterThan(0);
  });
});

describe('normalizeHouse', () => {
  it('keeps what is real', () => {
    const house: House = { floor: 'decor-floor-rug', wall: 'decor-wall-shelf' };
    expect(normalizeHouse(house)).toEqual(house);
  });

  it('reads an absent house as an empty room rather than throwing', () => {
    expect(normalizeHouse(undefined)).toEqual({});
  });

  it('drops a piece that is no longer in the catalogue', () => {
    // A piece retired in a later version is still written in somebody's saved
    // house, and would otherwise be looked up forever and drawn as nothing.
    expect(normalizeHouse({ floor: 'decor-floor-retired' })).toEqual({});
  });

  it('drops a piece stored under the wrong slot', () => {
    // Otherwise a rug ends up in the wall layer — hung up, behind the bird.
    expect(normalizeHouse({ wall: 'decor-floor-rug' })).toEqual({});
  });
});

describe('which piece wins a slot', () => {
  /**
   * The tie-break is a decision this module makes rather than a rule it
   * restates, so it is pinned rather than left to read off the code.
   */
  it('prefers the dearer piece', () => {
    for (const slot of HOUSE_SLOTS) {
      const [a, b] = furnitureForSlot(slot);
      const dearer = a.price > b.price ? a : b;
      const cheaper = a.price > b.price ? b : a;
      expect(compareFurniture(dearer, cheaper), slot).toBeGreaterThan(0);
      expect(compareFurniture(cheaper, dearer), slot).toBeLessThan(0);
    }
  });

  it('is a total order, so two pieces always resolve', () => {
    for (const a of FURNITURE) {
      for (const b of FURNITURE) {
        if (a === b) expect(compareFurniture(a, b)).toBe(0);
        else expect(compareFurniture(a, b), `${a.id} vs ${b.id}`).not.toBe(0);
      }
    }
  });

  it('is antisymmetric', () => {
    for (const a of FURNITURE) {
      for (const b of FURNITURE) {
        // Summed rather than negated: `-0` is not `0` under Object.is, and
        // comparing a piece with itself produces exactly that.
        expect(
          Math.sign(compareFurniture(a, b)) + Math.sign(compareFurniture(b, a)),
          `${a.id} vs ${b.id}`,
        ).toBe(0);
      }
    }
  });

  /**
   * The reason `compareFurniture` names price and not tier: `tierForPrice`
   * walks the ladder picking the highest rung a price reaches, so it is
   * monotonic in price and a dearer piece can never be a lower tier. If a
   * later price list broke that, "highest price" would stop meaning "highest
   * tier" and this is where it would show up.
   */
  it('orders by price without ever contradicting the tier ladder', () => {
    for (const a of FURNITURE) {
      for (const b of FURNITURE) {
        if (a.price <= b.price) {
          expect(tierRank(tierForPrice(a.price)), `${a.id} vs ${b.id}`)
            .toBeLessThanOrEqual(tierRank(tierForPrice(b.price)));
        }
      }
    }
  });
});

describe('bestForSlot', () => {
  it('finds nothing when nothing in that slot is owned', () => {
    expect(bestForSlot([], 'floor')).toBeUndefined();
    expect(bestForSlot(['decor-window-rain'], 'floor')).toBeUndefined();
  });

  it('takes the better of two owned pieces', () => {
    const [a, b] = furnitureForSlot('floor');
    const dearer = a.price > b.price ? a : b;
    expect(bestForSlot([a.id, b.id], 'floor')?.id).toBe(dearer.id);
  });

  it('ignores an id nobody stocks', () => {
    expect(bestForSlot(['decor-nope'], 'floor')).toBeUndefined();
  });
});

describe('the room somebody\'s furniture makes', () => {
  it('is empty with nothing owned', () => {
    expect(houseFrom([])).toEqual({});
  });

  it('fills every slot there is something for, and no others', () => {
    const one = FURNITURE.filter((piece) => piece.slot === 'floor')[0];
    expect(houseFrom([one.id])).toEqual({ floor: one.id });
  });

  it('fills the whole room when everything is owned', () => {
    const house = houseFrom(FURNITURE.map((piece) => piece.id));
    expect(Object.keys(house).sort()).toEqual([...HOUSE_SLOTS].sort());
  });

  it('is the same room from the same ids, in any order', () => {
    const ids = FURNITURE.map((piece) => piece.id);
    expect(houseFrom(ids)).toEqual(houseFrom([...ids].reverse()));
  });
});

/**
 * The property that makes auto-placement safe between two phones.
 *
 * `Pet.house` is couple-level and `inventory` is per-member and not
 * partner-visible, so each phone sees only half of what the couple owns.
 * Anything other than upgrade-only would have the two devices taking turns
 * deleting each other's furniture on every sync.
 */
describe('bringing a stored room up to date', () => {
  const rug = FURNITURE.find((f) => f.slot === 'floor')!;
  const otherFloor = FURNITURE.filter((f) => f.slot === 'floor')[1];
  const dearerFloor = rug.price > otherFloor.price ? rug : otherFloor;
  const cheaperFloor = rug.price > otherFloor.price ? otherFloor : rug;

  it('keeps a piece this member does not own', () => {
    expect(refurnish({ floor: dearerFloor.id }, [])).toEqual({ floor: dearerFloor.id });
  });

  it('never replaces a better piece with a worse one', () => {
    const before: House = { floor: dearerFloor.id };
    expect(refurnish(before, [cheaperFloor.id])).toEqual({ floor: dearerFloor.id });
  });

  it('upgrades a slot when this member owns something better', () => {
    expect(refurnish({ floor: cheaperFloor.id }, [dearerFloor.id]))
      .toEqual({ floor: dearerFloor.id });
  });

  it('fills a slot that was bare', () => {
    expect(refurnish({}, [rug.id])).toEqual({ floor: rug.id });
  });

  it('is idempotent, so a second sync writes nothing new', () => {
    const ids = [rug.id];
    const once = refurnish({}, ids);
    expect(refurnish(once, ids)).toEqual(once);
  });

  /** Neither order of two members' purchases can lose either of them. */
  it('converges whichever phone applies first', () => {
    const hers = [dearerFloor.id];
    const his = FURNITURE.filter((f) => f.slot === 'wall').map((f) => f.id);
    const herFirst = refurnish(refurnish({}, hers), his);
    const hisFirst = refurnish(refurnish({}, his), hers);
    expect(herFirst).toEqual(hisFirst);
    expect(herFirst.floor).toBe(dearerFloor.id);
    expect(herFirst.wall).toBeDefined();
  });

  it('drops a retired id rather than carrying it forward', () => {
    expect(refurnish({ floor: 'decor-gone' } as House, [])).toEqual({});
  });
});

describe('furnitureById', () => {
  it('finds one, and nothing for an id nobody has', () => {
    expect(furnitureById('decor-floor-rug')?.name).toBe('Round rug');
    expect(furnitureById('decor-nope')).toBeUndefined();
    expect(furnitureById(undefined)).toBeUndefined();
  });
});

describe('the drawing order', () => {
  it('runs from the far wall forward', () => {
    // The room is one SVG so the pieces share a coordinate space and stack
    // correctly: the window is a hole in the far wall, things hang on the wall
    // in front of it, the floor is nearer, and a perch stands in front of all
    // of it. The bird is drawn after this whole list — see the note on
    // HOUSE_SLOTS for what went wrong when it was not.
    expect([...HOUSE_SLOTS]).toEqual(['window', 'wall', 'floor', 'perch']);
  });

  it('covers every slot exactly once, so nothing is silently undrawable', () => {
    expect(new Set(HOUSE_SLOTS).size).toBe(HOUSE_SLOTS.length);
    for (const item of FURNITURE) expect(HOUSE_SLOTS, item.id).toContain(item.slot);
  });
});
