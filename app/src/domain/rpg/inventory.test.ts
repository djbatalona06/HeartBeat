import { describe, expect, it } from 'vitest';
import { findOwned, ownsItem, refineByItemId, type InventoryItem } from './inventory';

const AT = 1_700_000_000_000;
function row(itemId: string, refine = 0): InventoryItem {
  return { id: `inv-${itemId}`, coupleId: 'c1', memberId: 'm1', itemId, refine, acquiredAt: AT, updatedAt: AT };
}

describe('ownsItem', () => {
  it('is true for an item in the list', () => {
    expect(ownsItem([row('a'), row('b')], 'b')).toBe(true);
  });

  it('is false for one that is not', () => {
    expect(ownsItem([row('a')], 'z')).toBe(false);
  });

  it('is false for an empty list', () => {
    expect(ownsItem([], 'a')).toBe(false);
  });
});

describe('findOwned', () => {
  it('finds the row by item id', () => {
    const target = row('b', 2);
    expect(findOwned([row('a'), target], 'b')).toBe(target);
  });

  it('returns undefined when not owned', () => {
    expect(findOwned([row('a')], 'z')).toBeUndefined();
  });
});

describe('refineByItemId', () => {
  it('builds a lookup of item id to refine level', () => {
    expect(refineByItemId([row('a', 1), row('b', 3)])).toEqual({ a: 1, b: 3 });
  });

  it('is empty for no rows', () => {
    expect(refineByItemId([])).toEqual({});
  });
});
