import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_HEIGHT, ARENA_WIDTH, ISLAND_1_ARENAS } from '../../../../domain/rpg/arena';
import { BOARD_KITS, boardMarks, type BoardMark } from '../../../../domain/rpg/boards';
import { MARK_ROLES, arenaPaint } from './arenaPalette';
import { FLOOR_TOP } from './boardCamera';
import { buildBoardMarks, markParts } from './boardMarks';
import { MAX_LIFT } from './boardPieces';

const paint = arenaPaint({
  base: [0.1, 0.1, 0.12], text: [0.95, 0.93, 0.9], accent: [0.9, 0.3, 0.5],
  success: [0.3, 0.7, 0.4], danger: [0.8, 0.2, 0.2],
});

describe('the board marks', () => {
  /** If the domain grew a mark the 3D side cannot draw, a kit would silently show nothing for it. */
  it('draws exactly the marks the domain can ask for', () => {
    const all: BoardMark[] = ['step', 'inlay', 'quilt', 'weave'];
    expect([...MARK_ROLES].sort()).toEqual([...all].sort());
    const asked = new Set<string>();
    for (const kit of BOARD_KITS) {
      for (const arena of ISLAND_1_ARENAS) for (const m of boardMarks(kit.id, arena).flat()) if (m) asked.add(m);
    }
    expect([...asked].sort()).toEqual([...all].sort());
  });

  it('keeps every mark low: a pattern in the floor, not an obstacle', () => {
    for (const role of MARK_ROLES) {
      for (const part of markParts(role)) {
        expect(part.h, role).toBeGreaterThan(0);
        expect(part.h, role).toBeLessThanOrEqual(0.1);
        expect(part.h, role).toBeLessThanOrEqual(MAX_LIFT);
        expect(part.w, role).toBeLessThanOrEqual(1);
        expect(part.d, role).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(BOARD_KITS.map((k) => k.id))('%s builds one mesh per part per marked tile, inside the board', (kit) => {
    for (const arena of ISLAND_1_ARENAS) {
      const marks = boardMarks(kit, arena);
      const expected = marks.flat().reduce((n, m) => n + (m ? markParts(m).length : 0), 0);
      const group = buildBoardMarks(marks, paint.marks);
      expect(group.children).toHaveLength(expected);
      if (expected === 0) continue;
      const box = new Box3().setFromObject(group);
      expect(box.min.x).toBeGreaterThanOrEqual(-ARENA_WIDTH / 2 - 1e-6);
      expect(box.max.x).toBeLessThanOrEqual(ARENA_WIDTH / 2 + 1e-6);
      expect(box.min.z).toBeGreaterThanOrEqual(-ARENA_HEIGHT / 2 - 1e-6);
      expect(box.max.z).toBeLessThanOrEqual(ARENA_HEIGHT / 2 + 1e-6);
      expect(box.min.y).toBeGreaterThanOrEqual(FLOOR_TOP - 1e-6);
    }
  });
});
