/**
 * The front door is the one screen whose whole job is how it looks, and its
 * look is arithmetic: six bubbles evenly spaced, none touching another, none
 * touching the pet, on a box that is a different size on every phone. A
 * screenshot on one handset proves none of that, so it is pinned here.
 */
import { describe, expect, it } from 'vitest';
import { HOME_DESTINATIONS, ringLayout, type RingSlot } from './layout';

/** A 390×844 phone, less the shell's 18px side padding: the common case. */
const PHONE_BOX = { width: 354, height: 354 };
/** An iPhone SE, where the ring has the least room to work with. */
const SHORT_BOX = { width: 339, height: 300 };

/** `--tap` plus `--space-5`, the two tokens the page actually measures. */
const BUBBLE = 72;
const GAP = 24;

/**
 * The floor the stylesheet promises on a short screen — `--home-bubble * 4`.
 * If this box ever stopped fitting, the ring would silently drop to its rows
 * fallback on ordinary small phones, so the two numbers are pinned together.
 */
const FLOOR_BOX = { width: BUBBLE * 4, height: BUBBLE * 4 };

function distance(a: RingSlot, b: RingSlot): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Gaps between consecutive angles, wrapping the last back round to the first. */
function angleSteps(slots: RingSlot[]): number[] {
  return slots.map((slot, i) => {
    const next = slots[(i + 1) % slots.length];
    return (next.angle - slot.angle + 360) % 360;
  });
}

describe('ringLayout', () => {
  it('spaces every bubble by the same angle', () => {
    for (const count of [3, 4, 5, 6, 8]) {
      const steps = angleSteps(ringLayout({ count, box: PHONE_BOX, bubble: BUBBLE, gap: GAP }).slots);
      for (const step of steps) expect(step, `${count} bubbles`).toBeCloseTo(360 / count, 6);
    }
  });

  it('puts the first bubble straight up whatever the count', () => {
    for (const count of [1, 2, 3, 5, 6, 7]) {
      const ring = ringLayout({ count, box: PHONE_BOX, bubble: BUBBLE, gap: GAP });
      expect(ring.slots[0].x, `${count} bubbles`).toBeCloseTo(ring.centre.x, 3);
      expect(ring.slots[0].y, `${count} bubbles`).toBeLessThan(ring.centre.y);
    }
  });

  it('leaves air between neighbours rather than letting them touch', () => {
    for (const box of [PHONE_BOX, SHORT_BOX, FLOOR_BOX]) {
      const ring = ringLayout({ count: 6, box, bubble: BUBBLE, gap: GAP });
      for (let i = 0; i < ring.slots.length; i += 1) {
        const next = ring.slots[(i + 1) % ring.slots.length];
        expect(distance(ring.slots[i], next), `${box.width}×${box.height}`).toBeGreaterThan(BUBBLE);
      }
      expect(ring.clearance).toBeGreaterThanOrEqual(GAP);
      expect(ring.fits).toBe(true);
    }
  });

  it('keeps every bubble wholly inside the box', () => {
    for (const box of [PHONE_BOX, SHORT_BOX, FLOOR_BOX]) {
      for (const slot of ringLayout({ count: 6, box, bubble: BUBBLE, gap: GAP }).slots) {
        expect(slot.x - BUBBLE / 2).toBeGreaterThanOrEqual(-0.001);
        expect(slot.y - BUBBLE / 2).toBeGreaterThanOrEqual(-0.001);
        expect(slot.x + BUBBLE / 2).toBeLessThanOrEqual(box.width + 0.001);
        expect(slot.y + BUBBLE / 2).toBeLessThanOrEqual(box.height + 0.001);
      }
    }
  });

  it('gives the mascot a circle no bubble reaches into', () => {
    const ring = ringLayout({ count: 6, box: PHONE_BOX, bubble: BUBBLE, gap: GAP });
    expect(ring.mascot).toBeGreaterThan(0);
    for (const slot of ring.slots) {
      const edgeToEdge = Math.hypot(slot.x - ring.centre.x, slot.y - ring.centre.y)
        - BUBBLE / 2
        - ring.mascot / 2;
      expect(edgeToEdge).toBeCloseTo(GAP, 3);
    }
  });

  it('holds the ring still when only the count changes', () => {
    const five = ringLayout({ count: 5, box: PHONE_BOX, bubble: BUBBLE, gap: GAP });
    const six = ringLayout({ count: 6, box: PHONE_BOX, bubble: BUBBLE, gap: GAP });
    expect(six.radius).toBe(five.radius);
    expect(six.mascot).toBe(five.mascot);
    expect(six.centre).toEqual(five.centre);
  });

  it('is stable: the same spec twice gives the same numbers', () => {
    const spec = { count: 6, box: PHONE_BOX, bubble: BUBBLE, gap: GAP };
    expect(ringLayout(spec)).toEqual(ringLayout(spec));
  });

  it('turns the ring the whole way round when asked for a start angle', () => {
    const turned = ringLayout({ count: 4, box: PHONE_BOX, bubble: BUBBLE, gap: GAP, startAngle: 45 });
    expect(turned.slots.map((s) => s.angle)).toEqual([45, 135, 225, 315]);
    // 45° clockwise from twelve is up and to the right: x grows, y shrinks.
    expect(turned.slots[0].x).toBeGreaterThan(turned.centre.x);
    expect(turned.slots[0].y).toBeLessThan(turned.centre.y);
  });

  it('reports rather than pretends when the box is too small to seat the ring', () => {
    const cramped = ringLayout({ count: 6, box: { width: 120, height: 120 }, bubble: BUBBLE, gap: GAP });
    expect(cramped.fits).toBe(false);
    expect(cramped.mascot).toBe(0);
  });

  it('says no to a landscape phone, which is what sends the page to its rows fallback', () => {
    // 844×390 with the shell's padding off it, and the ring capped at 460 wide.
    const landscape = ringLayout({ count: 6, box: { width: 460, height: 190 }, bubble: BUBBLE, gap: GAP });
    expect(landscape.fits).toBe(false);
  });

  it('survives a zero box and a zero count without producing NaN', () => {
    const nothing = ringLayout({ count: 0, box: { width: 0, height: 0 }, bubble: BUBBLE, gap: GAP });
    expect(nothing.slots).toEqual([]);
    expect(nothing.radius).toBe(0);
    expect(nothing.mascot).toBe(0);
    expect(nothing.fits).toBe(true);

    const one = ringLayout({ count: 1, box: PHONE_BOX, bubble: BUBBLE, gap: GAP });
    expect(one.clearance).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(one.slots[0].x)).toBe(false);
  });
});

describe('HOME_DESTINATIONS', () => {
  it('stops at six, the point past which bubbles crowd the pet', () => {
    expect(HOME_DESTINATIONS.length).toBeLessThanOrEqual(6);
  });

  it('sends every bubble somewhere different, and somewhere real', () => {
    const routes = HOME_DESTINATIONS.map((d) => d.to);
    expect(new Set(routes).size).toBe(routes.length);
    for (const route of routes) expect(route).toMatch(/^\/[a-z]+$/);
  });

  it('reaches Party, which no tab and no other screen puts a door on', () => {
    expect(HOME_DESTINATIONS.map((d) => d.to)).toContain('/party');
  });

  it('gives every door a label and a glyph, and repeats neither', () => {
    for (const door of HOME_DESTINATIONS) {
      expect(door.label.length, door.to).toBeGreaterThan(0);
      expect(door.glyph.length, door.to).toBeGreaterThan(0);
    }
    expect(new Set(HOME_DESTINATIONS.map((d) => d.label)).size).toBe(HOME_DESTINATIONS.length);
    expect(new Set(HOME_DESTINATIONS.map((d) => d.glyph)).size).toBe(HOME_DESTINATIONS.length);
  });
});
