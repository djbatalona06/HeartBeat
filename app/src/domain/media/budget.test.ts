import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYLOAD_BYTES,
  ENTRY_KINDS,
  PHOTO_PAYLOAD_BYTES,
  PULL_BYTE_BUDGET,
  pageWithinBudget,
  payloadLimit,
  takeWithinBudget,
  utf8Bytes,
  withinPayloadLimit,
} from './budget';
import { PHOTO_BUDGET_BYTES } from '../../features/exercise/photo';

describe('utf8Bytes', () => {
  it('agrees with String.length for ASCII', () => {
    expect(utf8Bytes('hello')).toBe(5);
  });

  it('counts bytes, not UTF-16 units — the bug a .length check has', () => {
    // Each of these is one JS "character" by eye but more than one byte.
    expect(utf8Bytes('é')).toBe(2);
    expect(utf8Bytes('日')).toBe(3);
    // An emoji is a surrogate pair: .length is 2, the wire cost is 4.
    expect('💪'.length).toBe(2);
    expect(utf8Bytes('💪')).toBe(4);
  });

  it('under-counting by .length is what lets an oversize payload through', () => {
    const note = '💪'.repeat(20_000);
    expect(note.length).toBeLessThan(DEFAULT_PAYLOAD_BYTES);
    expect(utf8Bytes(note)).toBeGreaterThan(DEFAULT_PAYLOAD_BYTES);
    expect(withinPayloadLimit('mood', note)).toBe(false);
  });
});

describe('payloadLimit', () => {
  it('gives photo its own ceiling and leaves the rest where they were', () => {
    expect(payloadLimit('photo')).toBe(PHOTO_PAYLOAD_BYTES);
    for (const kind of ENTRY_KINDS) {
      if (kind === 'photo') continue;
      expect(payloadLimit(kind)).toBe(DEFAULT_PAYLOAD_BYTES);
    }
  });

  it('fits two proofs at the capture budget, with room for the JSON around them', () => {
    // What a day of proof actually weighs: two base64 photos at their capture
    // ceiling. If this ever stops fitting, the ceiling is the thing to move.
    const twoProofs = 2 * PHOTO_BUDGET_BYTES;
    expect(twoProofs).toBeLessThan(PHOTO_PAYLOAD_BYTES);
    expect(PHOTO_PAYLOAD_BYTES - twoProofs).toBeGreaterThan(64 * 1024);
  });

  it('refuses a capture that skipped the downscale ladder', () => {
    // A full-resolution phone JPEG, base64'd, is several megabytes.
    const raw = 'A'.repeat(3 * 1024 * 1024);
    expect(withinPayloadLimit('photo', raw)).toBe(false);
  });
});

describe('takeWithinBudget', () => {
  const row = (bytes: number, id: string) => ({ bytes, id });

  it('takes everything when it all fits', () => {
    const rows = [row(10, 'a'), row(10, 'b'), row(10, 'c')];
    expect(takeWithinBudget(rows, 100).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('stops before the row that would overrun', () => {
    const rows = [row(60, 'a'), row(60, 'b'), row(1, 'c')];
    expect(takeWithinBudget(rows, 100).map((r) => r.id)).toEqual(['a']);
  });

  it('fills up to the budget exactly', () => {
    const rows = [row(50, 'a'), row(50, 'b'), row(1, 'c')];
    expect(takeWithinBudget(rows, 100).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('always yields one row, so an oversize row cannot wedge the cursor', () => {
    // The row is four times the budget on its own. Returning nothing would
    // leave the cursor where it is and the client asking for the same page
    // forever; returning it alone lets the cursor step past it.
    const rows = [row(400, 'huge'), row(1, 'next')];
    expect(takeWithinBudget(rows, 100).map((r) => r.id)).toEqual(['huge']);
  });

  it('is empty only when there is nothing to send', () => {
    expect(takeWithinBudget([], 100)).toEqual([]);
  });

  it('defaults to the pull budget', () => {
    const rows = [row(PULL_BYTE_BUDGET, 'a'), row(1, 'b')];
    expect(takeWithinBudget(rows).map((r) => r.id)).toEqual(['a']);
  });
});

describe('pageWithinBudget', () => {
  const row = (bytes: number, updatedAt: number) => ({ bytes, updatedAt });

  it('serves everything when it all fits', () => {
    expect(pageWithinBudget([row(10, 1), row(10, 2), row(10, 3)], 100)).toBe(3);
  });

  it('stops where the next row would overrun', () => {
    expect(pageWithinBudget([row(60, 1), row(60, 2), row(1, 3)], 100)).toBe(1);
  });

  it('always serves one row, so an oversize row cannot wedge the cursor', () => {
    expect(pageWithinBudget([row(400, 1), row(1, 2)], 100)).toBe(1);
  });

  it('is empty only when there is nothing waiting', () => {
    expect(pageWithinBudget([], 100)).toBe(0);
  });

  /**
   * The silent-loss case. The cursor is the last served row's timestamp and the
   * next pull asks for strictly greater, so cutting between two rows that share
   * one means the second is never requested again by anybody.
   */
  it('does not cut between rows sharing a timestamp', () => {
    // Budget stops after the first, but rows 2 and 3 carry the same stamp as it.
    const rows = [row(60, 100), row(60, 100), row(60, 100), row(1, 200)];
    expect(pageWithinBudget(rows, 100)).toBe(3);
  });

  it('cuts freely once the timestamp changes', () => {
    const rows = [row(60, 100), row(60, 100), row(1, 200)];
    expect(pageWithinBudget(rows, 100)).toBe(2);
  });

  it('accepts going over budget rather than losing a row', () => {
    // One run, all of it past the budget: served whole, because the
    // alternative is dropping rows nothing will ask for again.
    const rows = [row(500, 7), row(500, 7), row(500, 7)];
    expect(pageWithinBudget(rows, 100)).toBe(3);
  });

  it('leaves a tie alone when the cut already falls after it', () => {
    const rows = [row(10, 1), row(10, 1), row(90, 2), row(10, 3)];
    // Fits the first three exactly; the run at stamp 1 is already whole.
    expect(pageWithinBudget(rows, 110)).toBe(3);
  });
});
