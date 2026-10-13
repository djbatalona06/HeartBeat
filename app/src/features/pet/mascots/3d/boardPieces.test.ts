import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ISLAND_1_ARENAS, ARENA_HEIGHT, ARENA_WIDTH, tileKindAt } from '../../../../domain/rpg/arena';
import { TILE_KINDS } from '../../../../domain/rpg/zones';
import { PIECE_ROLES, arenaPaint } from './arenaPalette';
import { FLOOR_TOP } from './boardCamera';
import { MAX_LIFT, PIECE_SPRITES, buildBoardPieces, pieceSpec } from './boardPieces';

const sprites = new Set(TILE_KINDS.map((k) => k.sprite));
const paint = arenaPaint({
  base: [0.1, 0.1, 0.12], text: [0.95, 0.93, 0.9], accent: [0.9, 0.3, 0.5],
  success: [0.3, 0.7, 0.4], danger: [0.8, 0.2, 0.2],
});

describe('the board pieces', () => {
  it('draws every tile kind the arena has, except the checkerboard ground, and nothing the arena lacks', () => {
    const drawn = TILE_KINDS.map((k) => k.sprite).filter((s) => pieceSpec(s, 4, 3, ARENA_WIDTH, ARENA_HEIGHT));
    expect(new Set(drawn)).toEqual(new Set(PIECE_SPRITES));
    for (const sprite of PIECE_SPRITES) expect(sprites.has(sprite), sprite).toBe(true);
    // Grass and path are the floor itself.
    expect(pieceSpec('tile-grass', 4, 3, ARENA_WIDTH, ARENA_HEIGHT)).toBeUndefined();
    expect(pieceSpec('tile-path', 4, 3, ARENA_WIDTH, ARENA_HEIGHT)).toBeUndefined();
  });

  it('names a role the palette paints, and keeps every piece low enough not to cover the row above', () => {
    for (const sprite of PIECE_SPRITES) {
      const spec = pieceSpec(sprite, 4, 3, ARENA_WIDTH, ARENA_HEIGHT)!;
      expect(PIECE_ROLES).toContain(spec.role);
      expect(spec.height, sprite).toBeLessThanOrEqual(MAX_LIFT);
      expect(spec.fill, sprite).toBeGreaterThan(0);
      expect(spec.fill, sprite).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the border hedge lower than a hedge in the middle of the board', () => {
    const edge = pieceSpec('tile-hedge', 0, 2, ARENA_WIDTH, ARENA_HEIGHT)!;
    const inner = pieceSpec('tile-hedge', 5, 3, ARENA_WIDTH, ARENA_HEIGHT)!;
    expect(edge.height).toBeLessThan(inner.height);
  });

  /** One piece for every solid or decorated cell of every authored stage, and none outside the board. */
  it.each(ISLAND_1_ARENAS.map((arena, i) => [i + 1, arena] as const))('stands pieces exactly where stage %i has them', (_stage, arena) => {
    const layout = arena.rows.map((_, y) =>
      Array.from({ length: ARENA_WIDTH }, (_, x) => tileKindAt(arena, x, y)?.sprite));
    const expected = layout.flat().filter((s) => s && pieceSpec(s, 4, 3, ARENA_WIDTH, ARENA_HEIGHT)).length;
    const group = buildBoardPieces(layout, paint.pieces);
    expect(group.children.length).toBe(expected);

    const box = new Box3().setFromObject(group);
    expect(box.min.x).toBeGreaterThanOrEqual(-ARENA_WIDTH / 2 - 1e-6);
    expect(box.max.x).toBeLessThanOrEqual(ARENA_WIDTH / 2 + 1e-6);
    expect(box.min.z).toBeGreaterThanOrEqual(-ARENA_HEIGHT / 2 - 1e-6);
    expect(box.max.z).toBeLessThanOrEqual(ARENA_HEIGHT / 2 + 1e-6);
    expect(box.min.y).toBeGreaterThanOrEqual(FLOOR_TOP - 1e-6);
    expect(box.max.y).toBeLessThanOrEqual(FLOOR_TOP + MAX_LIFT + 1e-6);
  });
});
