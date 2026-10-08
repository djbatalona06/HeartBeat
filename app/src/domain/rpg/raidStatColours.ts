import type { RaidStatKey } from './raidStats';

/**
 * One hue per raid stat, so a companion's stat wheel can say which corner is
 * which without a legend of seven words.
 *
 * Fixed rather than read from the theme pack, for the reason the heart vial's
 * sand is (`vial.ts`): a pack has one accent and the wheel needs seven things
 * told apart. Each sits between 0.10 and 0.30 relative luminance, which keeps it
 * at 3:1 or better against both a white and a black surface, so the same seven
 * work in every pack's light and dark palette. `raidStatColours.test.ts` holds
 * both of those. Hex lives here and never in a stylesheet (`styles.test.ts`);
 * the component hands it to CSS as `--stat`.
 *
 * Colour is never the only signal: the stat's name is printed beside it.
 */
export const STAT_COLOUR: Record<RaidStatKey, string> = {
  energy: '#B8860B',
  resilience: '#3E9A4F',
  resonance: '#7A5CC9',
  burden: '#C23B3B',
  fortify: '#3D7DD8',
  reveal: '#1F8F9A',
  recovery: '#C2448F',
};
