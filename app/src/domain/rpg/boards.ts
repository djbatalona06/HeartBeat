import { ARENA_HEIGHT, ARENA_WIDTH, tileKindAt, type Arena } from './arena';

/**
 * The battle board's looks.
 *
 * A kit is how the same 11x7 grid is dressed: nothing about where you can walk,
 * what a fight is worth or what stands where. It is a choice of look, so it is
 * a plain setting (`Settings.boardKit`) and **not** an ownable thing -- the app's
 * rule that everything ownable carries a raid stat is about what a couple owns,
 * and a board is not owned, it is picked.
 *
 * Pure. Each kit says which ground tiles carry a mark and what kind
 * (`kitMarkOf`); the 3D bake builds a small solid for each mark and the Raid
 * Gate's preview draws a small square for it, from this one answer.
 */

export const BOARD_KITS = [
  { id: 'checker', name: 'Hearth Checker', blurb: 'The classic two-tone board.' },
  { id: 'terrace', name: 'Stepping Stones', blurb: 'Every other tile steps up a little.' },
  { id: 'inlay', name: 'Lantern Inlay', blurb: 'A glowing ring marks where you and your foe stand.' },
  { id: 'quilt', name: 'Patchwork', blurb: 'Three tones, stitched like a quilt.' },
  { id: 'weave', name: 'Basketweave', blurb: 'Each tile is woven with fine raised lines.' },
] as const;

export type BoardKitId = (typeof BOARD_KITS)[number]['id'];

export const DEFAULT_BOARD_KIT: BoardKitId = 'checker';

/** Whatever was stored, as a kit this build knows. An unknown or missing one is the default, never an error. */
export function normalizeBoardKit(value: unknown): BoardKitId {
  return BOARD_KITS.find((kit) => kit.id === value)?.id ?? DEFAULT_BOARD_KIT;
}

/** What a ground tile can carry. Mirrors `MARK_ROLES` in `mascots/3d/arenaPalette.ts`; a test holds the two together. */
export type BoardMark = 'step' | 'inlay' | 'quilt' | 'weave';

export interface Focus {
  x: number;
  y: number;
}

/** The mark a tile carries under a kit, or undefined for a bare tile. `focus` is where the pet and the foe stand. */
export function kitMarkOf(
  kit: BoardKitId,
  col: number,
  row: number,
  focus: readonly Focus[],
): BoardMark | undefined {
  switch (kit) {
    case 'terrace':
      return (col + row) % 2 === 0 ? 'step' : undefined;
    case 'inlay':
      return focus.some((f) => Math.max(Math.abs(f.x - col), Math.abs(f.y - row)) <= 1) ? 'inlay' : undefined;
    case 'quilt':
      return (col + 2 * row) % 3 === 0 ? 'quilt' : undefined;
    case 'weave':
      return 'weave';
    default:
      return undefined;
  }
}

/** Only open ground carries a mark: a hedge, a pond or a stone is a piece, and keeps its own look. */
const GROUND = ['tile-grass', 'tile-path'];

/** `marks[row][col]` for a stage: the one grid reader (`tileKindAt`) decides which cells are ground. */
export function boardMarks(kit: BoardKitId, arena: Arena): (BoardMark | undefined)[][] {
  const focus = [arena.spawn, arena.monster];
  return Array.from({ length: ARENA_HEIGHT }, (_, y) =>
    Array.from({ length: ARENA_WIDTH }, (_, x) => {
      const sprite = tileKindAt(arena, x, y)?.sprite;
      return sprite && GROUND.includes(sprite) ? kitMarkOf(kit, x, y, focus) : undefined;
    }));
}
