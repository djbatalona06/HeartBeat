import { luma, mix, type Rgb, type Tokens } from './gardenPalette';

/**
 * How the battle board's checkerboard is painted from the theme in front of it.
 *
 * Kept apart from `gardenPalette.ts` on purpose: that file's `ROLES` is checked
 * against `garden.glb`'s material names, so adding a role there would force the
 * tree to carry it too. The tokens and the blending helpers are shared; the
 * roles are this file's own, checked against `arena.glb` by `arenaModel.test.ts`.
 *
 * Pure arithmetic on sRGB triples, testable without a GPU. Every role is a blend
 * of tokens the pack already owns, never a new hue.
 */
export const ARENA_ROLES = ['tileA', 'tileB', 'grout'] as const;
export type ArenaRole = (typeof ARENA_ROLES)[number];

export interface ArenaPaint {
  colors: Record<ArenaRole, Rgb>;
  sky: Rgb;
  bounce: Rgb;
  ambient: number;
  sun: number;
}

export function arenaPaint(t: Tokens): ArenaPaint {
  const dark = luma(t.base) < 0.35;
  const [ink, paper] = luma(t.base) < luma(t.text) ? [t.base, t.text] : [t.text, t.base];
  // Both squares stay close to the page so the pet and the foe stand out from
  // the floor; they differ from each other by a clear step, so it reads as a
  // checkerboard on a small phone and still does when the sprites sit on top.
  const floor = mix(t.base, t.accent, dark ? 0.2 : 0.3);
  return {
    colors: {
      tileA: floor,
      tileB: mix(floor, dark ? paper : ink, dark ? 0.14 : 0.16),
      grout: mix(ink, t.accent, 0.18),
    },
    sky: mix(paper, t.accent, 0.12),
    bounce: mix(ink, t.accent, 0.2),
    ambient: dark ? 1.7 : 2.3,
    sun: dark ? 1.4 : 1.6,
  };
}
