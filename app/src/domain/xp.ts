import type { Quest } from './types';

/**
 * Levelling curve. Each level costs a little more than the last, so early
 * levels arrive fast enough to be worth chasing and later ones still mean
 * something. Thresholds are cumulative XP.
 *
 * ## Why it is four bands rather than one exponent
 *
 * It used to be one exponent — 1.35, forever, with no ceiling — and that is a
 * fine curve for ten levels and an absurd one for fifty. `1.35^49` is about
 * four million, so a flat 1.35 does not make level 50 hard, it makes it a
 * number nobody will ever see, which is the same thing as not having it.
 *
 * So the growth rate itself decays in bands. **Levels 2–10 are untouched at
 * 1.35** — that is exactly the curve that shipped, and a couple who already
 * have a level-6 pet must not wake up tomorrow with a level-4 one. Every band
 * above it is *softer* than what was there before, so this release can only
 * ever hand a level back, never take one.
 *
 * ## What the bands actually cost
 *
 * At roughly 300 XP a day — two people logging a mood, a workout, some rest
 * and a gratitude each, plus the odd fight — the bands land about here:
 *
 * | Band | Reaches | Cumulative XP | Roughly |
 * |---|---|---|---|
 * | 2–10 | level 10 | ~4,000 | a fortnight |
 * | 11–20 | level 20 | ~25,700 | three months |
 * | 21–30 | level 30 | ~76,300 | eight months |
 * | 31–50 | level 50 | ~252,800 | a couple of years |
 *
 * The last row is stated plainly rather than sold as "months", because it is
 * not months. Level 50 is the ceiling of an app two people intend to keep, and
 * `xp.test.ts` pins these estimates so that changing a growth rate tells you
 * what it did to the calendar rather than only to the arithmetic.
 */
export const BASE_COST = 100;
export const GROWTH = 1.35;

/** The ceiling. Levelling stops here; nothing else does. */
export const MAX_LEVEL = 50;

export interface LevelBand {
  /** The last level in this band, inclusive. */
  through: number;
  /** What each level in it costs, as a multiple of the level below. */
  growth: number;
}

/**
 * Read as: "from the level after the previous band, up to `through`, each
 * level costs `growth` times the last one".
 *
 * The first band's growth is `GROWTH` by name rather than by value, so the
 * promise that the shipped early curve is untouched is one the code makes
 * rather than one a comment makes.
 */
export const LEVEL_BANDS: readonly LevelBand[] = [
  { through: 10, growth: GROWTH },
  { through: 20, growth: 1.12 },
  { through: 30, growth: 1.07 },
  { through: MAX_LEVEL, growth: 1.025 },
];

function growthAt(level: number): number {
  for (const band of LEVEL_BANDS) if (level <= band.through) return band.growth;
  return LEVEL_BANDS[LEVEL_BANDS.length - 1].growth;
}

/**
 * Cumulative XP for every level, built once.
 *
 * A table rather than a formula because the formula is now a running product
 * and re-deriving it inside `levelForXp`'s loop made that function quadratic —
 * which did not matter at ten levels and does at fifty, on a phone, inside a
 * live query.
 */
const THRESHOLDS: number[] = (() => {
  const out = [0, 0];
  let cost = BASE_COST;
  let total = 0;
  for (let level = 2; level <= MAX_LEVEL; level += 1) {
    if (level > 2) cost *= growthAt(level);
    total += Math.round(cost);
    out[level] = total;
  }
  return out;
})();

/** What one level costs on its own — the step, not the total. */
export function costOfLevel(level: number): number {
  if (level <= 1 || level > MAX_LEVEL) return 0;
  return THRESHOLDS[level] - THRESHOLDS[level - 1];
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return THRESHOLDS[MAX_LEVEL];
  return THRESHOLDS[level];
}

export function levelForXp(xp: number): number {
  if (xp <= 0) return 1;
  let level = 1;
  while (level < MAX_LEVEL && THRESHOLDS[level + 1] <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  into: number;
  needed: number;
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const needed = ceiling - floor;
  const into = xp - floor;
  // At the ceiling `needed` is zero and the bar is simply full. Reported as a
  // whole level rather than a divide by zero, so the last level looks finished
  // instead of looking broken.
  return { level, into, needed, fraction: needed === 0 ? 1 : into / needed };
}

/** True at the top of the curve, where there is nothing further to fill. */
export function isMaxLevel(level: number): boolean {
  return level >= MAX_LEVEL;
}

/** A quest pays out only once, on the transition to complete. */
export function questComplete(quest: Quest): boolean {
  return quest.progress >= quest.target;
}

export function awardFor(quests: Quest[]): number {
  return quests.filter(questComplete).reduce((sum, q) => sum + q.xp, 0);
}
