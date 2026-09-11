import { describe, expect, it } from 'vitest';
import {
  DECOR_PREFIX,
  FURNITURE,
  HOUSE_SLOTS,
  HOUSE_SLOT_NAMES,
  clearSlot,
  furnitureById,
  furnitureForSlot,
  normalizeHouse,
  placeIn,
  type House,
} from './furniture';

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

describe('placeIn', () => {
  it('puts a piece in its own slot, taking the slot from the item', () => {
    expect(placeIn({}, 'decor-perch-swing')).toEqual({ perch: 'decor-perch-swing' });
  });

  it('replaces whatever was in that slot, since only one thing fits', () => {
    const first = placeIn({}, 'decor-floor-rug');
    expect(placeIn(first, 'decor-floor-plant')).toEqual({ floor: 'decor-floor-plant' });
  });

  it('leaves the other slots alone', () => {
    const house = placeIn(placeIn({}, 'decor-floor-rug'), 'decor-wall-garland');
    expect(house).toEqual({ floor: 'decor-floor-rug', wall: 'decor-wall-garland' });
  });

  it('does not mutate the house it was given', () => {
    // The caller is a React render reading straight off a Dexie row.
    const before: House = { floor: 'decor-floor-rug' };
    placeIn(before, 'decor-wall-shelf');
    expect(before).toEqual({ floor: 'decor-floor-rug' });
  });

  it('ignores an unknown id rather than storing it', () => {
    expect(placeIn({ floor: 'decor-floor-rug' }, 'decor-nonsense')).toEqual({ floor: 'decor-floor-rug' });
  });

  it('normalizes on the way through, cleaning a stale house as it is rearranged', () => {
    expect(placeIn({ wall: 'decor-floor-rug' }, 'decor-perch-swing')).toEqual({ perch: 'decor-perch-swing' });
  });
});

describe('clearSlot', () => {
  it('empties one slot and leaves the rest', () => {
    const house: House = { floor: 'decor-floor-rug', perch: 'decor-perch-swing' };
    expect(clearSlot(house, 'floor')).toEqual({ perch: 'decor-perch-swing' });
  });

  it('is fine clearing a slot that was already bare', () => {
    expect(clearSlot({}, 'window')).toEqual({});
  });

  it('does not mutate its input either', () => {
    const before: House = { floor: 'decor-floor-rug' };
    clearSlot(before, 'floor');
    expect(before).toEqual({ floor: 'decor-floor-rug' });
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
