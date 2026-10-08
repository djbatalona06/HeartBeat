import { describe, expect, it } from 'vitest';
import { STAT_COLOUR } from './raidStatColours';
import { RAID_STATS } from './raidStats';

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

describe('the stat colours', () => {
  it('has one colour for every raid stat, and no others', () => {
    expect(Object.keys(STAT_COLOUR).sort()).toEqual([...RAID_STATS].sort());
  });

  it('uses seven different colours', () => {
    expect(new Set(Object.values(STAT_COLOUR)).size).toBe(RAID_STATS.length);
  });

  /** 3:1 is WCAG's bar for a graphic; the same seven have to clear it light and dark. */
  it('stands out 3:1 against both a white and a black surface', () => {
    for (const [stat, hex] of Object.entries(STAT_COLOUR)) {
      const l = luminance(hex);
      expect(contrast(l, 1), `${stat} on white`).toBeGreaterThanOrEqual(3);
      expect(contrast(l, 0), `${stat} on black`).toBeGreaterThanOrEqual(3);
    }
  });
});
