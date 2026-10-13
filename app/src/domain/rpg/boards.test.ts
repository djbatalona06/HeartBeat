import { describe, expect, it } from 'vitest';
import { ARENA_HEIGHT, ARENA_WIDTH, ISLAND_1_ARENAS, isWalkable } from './arena';
import { BOARD_KITS, DEFAULT_BOARD_KIT, boardMarks, kitMarkOf, normalizeBoardKit, type BoardKitId } from './boards';

describe('the board kits', () => {
  it('has five kits with unique ids and names, and the classic one is the default', () => {
    expect(BOARD_KITS).toHaveLength(5);
    expect(new Set(BOARD_KITS.map((k) => k.id)).size).toBe(5);
    expect(new Set(BOARD_KITS.map((k) => k.name)).size).toBe(5);
    expect(DEFAULT_BOARD_KIT).toBe('checker');
    for (const kit of BOARD_KITS) {
      expect(kit.name.length, kit.id).toBeGreaterThan(3);
      expect(kit.blurb.length, kit.id).toBeGreaterThan(10);
    }
  });

  it('turns anything unknown into the default instead of failing', () => {
    expect(normalizeBoardKit('weave')).toBe('weave');
    for (const bad of [undefined, null, '', 'sparkle', 3, {}]) expect(normalizeBoardKit(bad)).toBe('checker');
  });

  it('leaves the classic board bare', () => {
    for (const arena of ISLAND_1_ARENAS) {
      expect(boardMarks('checker', arena).flat().every((m) => m === undefined)).toBe(true);
    }
  });

  it('marks only open ground, never a hedge, a pond or a stone, and never changes where you can walk', () => {
    for (const kit of BOARD_KITS) {
      for (const arena of ISLAND_1_ARENAS) {
        const marks = boardMarks(kit.id, arena);
        expect(marks).toHaveLength(ARENA_HEIGHT);
        for (let y = 0; y < ARENA_HEIGHT; y += 1) {
          expect(marks[y]).toHaveLength(ARENA_WIDTH);
          for (let x = 0; x < ARENA_WIDTH; x += 1) {
            if (marks[y][x]) expect(isWalkable(arena, x, y), `${kit.id} ${x},${y}`).toBe(true);
          }
        }
      }
    }
  });

  it('gives each non-classic kit a look of its own: a mark nobody else uses, on a real share of the board', () => {
    const arena = ISLAND_1_ARENAS[4]; // the open stage, so nothing hides a mark
    const seen = new Map<string, BoardKitId>();
    for (const kit of BOARD_KITS.filter((k) => k.id !== 'checker')) {
      const flat = boardMarks(kit.id, arena).flat().filter(Boolean);
      expect(flat.length, kit.id).toBeGreaterThan(8);
      for (const mark of new Set(flat)) {
        expect(seen.has(mark as string), `${mark} is used by two kits`).toBe(false);
        seen.set(mark as string, kit.id);
      }
    }
  });

  it('rings the pet and the foe for Lantern Inlay, and nothing further away', () => {
    const focus = [{ x: 1, y: 3 }, { x: 9, y: 3 }];
    expect(kitMarkOf('inlay', 2, 4, focus)).toBe('inlay');
    expect(kitMarkOf('inlay', 8, 2, focus)).toBe('inlay');
    expect(kitMarkOf('inlay', 5, 3, focus)).toBeUndefined();
  });
});
