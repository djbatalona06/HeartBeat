import { describe, expect, it } from 'vitest';
import { LOGGABLE } from './charges';
import { SAND, SAND_LABEL, VIAL_SLOTS, vialFor } from './vial';

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

describe('the sand', () => {
  it('has one colour and one label for every loggable charge, and no others', () => {
    const loggable = LOGGABLE.map((l) => l.charge).sort();
    expect(Object.keys(SAND).sort()).toEqual(loggable);
    expect(Object.keys(SAND_LABEL).sort()).toEqual(loggable);
    expect(VIAL_SLOTS).toBe(loggable.length);
  });

  it('uses six different colours', () => {
    expect(new Set(Object.values(SAND)).size).toBe(Object.keys(SAND).length);
  });

  /** 3:1 is WCAG's bar for a graphic; the same six have to clear it light and dark. */
  it('stands out 3:1 against both a white and a black surface', () => {
    for (const [charge, hex] of Object.entries(SAND)) {
      const l = luminance(hex);
      expect(contrast(l, 1), `${charge} on white`).toBeGreaterThanOrEqual(3);
      expect(contrast(l, 0), `${charge} on black`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('vialFor', () => {
  it('is empty with nothing logged', () => {
    expect(vialFor([])).toEqual({ layers: [], fill: 0, bond: false, balance: false });
  });

  it('pours in a stable order, whatever order the charges arrive in', () => {
    const a = vialFor(['Mood', 'Exercise']);
    const b = vialFor(['Exercise', 'Mood']);
    expect(a.layers.map((l) => l.charge)).toEqual(['Exercise', 'Mood']);
    expect(b).toEqual(a);
    expect(a.layers.map((l) => l.index)).toEqual([0, 1]);
    expect(a.fill).toBeCloseTo(2 / 6);
  });

  it('keeps the earned charges out of the sand, as flags', () => {
    const v = vialFor(['Exercise', 'Work', 'Mood', 'Bond', 'Balance']);
    expect(v.layers).toHaveLength(3);
    expect(v.bond).toBe(true);
    expect(v.balance).toBe(true);
  });

  it('is full with every loggable charge lit', () => {
    expect(vialFor(LOGGABLE.map((l) => l.charge)).fill).toBe(1);
  });
});
