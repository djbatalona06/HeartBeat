import { describe, expect, it } from 'vitest';
import { MASCOT_ROSTER } from '../../features/pet/mascots/roster';
import { COSTUMES } from './costumes';
import { FIT, SLOT_EXTENT, fitFor, fitStyle, place } from './costumeFit';

/**
 * Measured off the mascot drawings in `features/pet/mascots/*.tsx`. If a
 * mascot's head moves, change the number here and the table in `costumeFit.ts`
 * together -- this is the check that they were changed together.
 *
 * head: centre x, top y, width. bottom: lowest point of the head (the body, for
 * Marigold, which has no head).
 */
const MEASURED: Record<string, { cx: number; top: number; w: number; bottom: number }> = {
  kitty: { cx: 50, top: 21, w: 60, bottom: 71 },   // Mochi: ellipse 50,46 30x25
  sponge: { cx: 50, top: 16, w: 66, bottom: 84 },  // Marigold: rect 17..83 x 16..84
  shinobi: { cx: 54, top: 22, w: 54, bottom: 70 }, // Foxglove: ellipse 54,46 27x24
  avatar: { cx: 50, top: 18, w: 50, bottom: 62 },  // Cirrus: ellipse 50,40 25x22
  pony: { cx: 50, top: 33, w: 50, bottom: 79 },    // Wishbell: ellipse 50,56 25x23
};

const MASCOTS = Object.keys(MASCOT_ROSTER);

describe('costume fit', () => {
  it('has a fit and a measurement for every mascot, and no others', () => {
    expect(Object.keys(FIT).sort()).toEqual([...MASCOTS].sort());
    expect(Object.keys(MEASURED).sort()).toEqual([...MASCOTS].sort());
  });

  it('keeps every slot of every costume inside the box on every mascot', () => {
    for (const mascot of MASCOTS) {
      for (const slot of ['head', 'neck', 'back'] as const) {
        const e = SLOT_EXTENT[slot];
        const lo = place(slot, mascot, { x: e.x0, y: e.y0 });
        const hi = place(slot, mascot, { x: e.x1, y: e.y1 });
        const where = `${mascot}/${slot}`;
        expect(lo.x, where).toBeGreaterThanOrEqual(-0.5);
        expect(lo.y, where).toBeGreaterThanOrEqual(-0.5);
        expect(hi.x, where).toBeLessThanOrEqual(100.5);
        expect(hi.y, where).toBeLessThanOrEqual(100.5);
      }
    }
  });

  it('lands hats on the head: centred, at its top, and about as wide', () => {
    for (const mascot of MASCOTS) {
      const head = FIT[mascot].head;
      const m = MEASURED[mascot];
      expect(Math.abs(head.x - m.cx), mascot).toBeLessThanOrEqual(3);
      // Sunk into the head a little, never floating above it.
      expect(head.y - m.top, mascot).toBeGreaterThanOrEqual(-1);
      expect(head.y - m.top, mascot).toBeLessThanOrEqual(5);
      expect(head.s * 60, mascot).toBeLessThanOrEqual(m.w * 1.1);
      expect(head.s * 60, mascot).toBeGreaterThanOrEqual(m.w * 0.7);
    }
  });

  it('puts scarves at the throat, between the middle of the head and its foot', () => {
    for (const mascot of MASCOTS) {
      const neck = FIT[mascot].neck;
      const m = MEASURED[mascot];
      expect(Math.abs(neck.x - m.cx), mascot).toBeLessThanOrEqual(3);
      expect(neck.y - m.bottom, mascot).toBeGreaterThanOrEqual(-15);
      expect(neck.y - m.bottom, mascot).toBeLessThanOrEqual(1);
    }
  });

  it('leaves the reference mascot exactly as drawn, and falls back to it', () => {
    expect(fitStyle('head', 'kitty')).toEqual({});
    expect(fitStyle('neck', 'kitty')).toEqual({});
    expect(fitFor('not-a-theme')).toBe(FIT.kitty);
    expect(fitFor(undefined)).toBe(FIT.kitty);
    expect(fitStyle('head', 'pony').transform).toContain('scale(0.85)');
  });

  it('gives every costume a slot, and keeps the three slots in use', () => {
    for (const costume of COSTUMES) expect(['head', 'neck', 'back'], costume.id).toContain(costume.slot);
    expect(new Set(COSTUMES.map((c) => c.slot))).toEqual(new Set(['head', 'neck', 'back']));
  });
});
