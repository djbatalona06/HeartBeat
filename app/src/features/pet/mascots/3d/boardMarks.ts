import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { MarkRole } from './arenaPalette';
import type { Rgb } from './gardenPalette';
import { FLOOR_TOP } from './boardCamera';

/**
 * What a board kit lays on the ground tiles, as small flat solids.
 *
 * `domain/rpg/boards.ts` decides *which* tiles carry a mark and of what kind; this
 * says what a mark is made of. Marks are low, a few hundredths of a tile, so
 * they read as a pattern in the floor and never as something to walk round.
 * Coloured by role from the pack's tokens (`arenaPaint(...).marks`).
 */

export interface MarkPart {
  /** Width and depth as a fraction of the tile, and height in tiles. */
  w: number;
  d: number;
  h: number;
}

const PARTS: Record<MarkRole, readonly MarkPart[]> = {
  // A slab a step above its neighbours.
  step: [{ w: 0.94, d: 0.94, h: 0.1 }],
  // A glowing pad, set in a little from the edge.
  inlay: [{ w: 0.78, d: 0.78, h: 0.035 }],
  // A square of the third tone, almost flush.
  quilt: [{ w: 0.94, d: 0.94, h: 0.02 }],
  // Two crossed bars, the weave.
  weave: [{ w: 0.8, d: 0.14, h: 0.03 }, { w: 0.14, d: 0.8, h: 0.03 }],
};

export const markParts = (mark: MarkRole): readonly MarkPart[] => PARTS[mark];

/** `marks[row][col]` is the mark on that tile, or undefined. Centred like `arena.glb`. */
export function buildBoardMarks(
  marks: readonly (readonly (MarkRole | undefined)[])[],
  colors: Record<MarkRole, Rgb>,
): Group {
  const group = new Group();
  group.name = 'marks';
  const rows = marks.length;
  const cols = marks[0]?.length ?? 0;
  const materials = new Map<MarkRole, MeshStandardMaterial>();
  const material = (role: MarkRole) => {
    let m = materials.get(role);
    if (!m) {
      m = new MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
      m.color.setRGB(...colors[role], SRGBColorSpace);
      m.name = role;
      materials.set(role, m);
    }
    return m;
  };
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const mark = marks[row][col];
      if (!mark) continue;
      for (const part of markParts(mark)) {
        const mesh = new Mesh(new BoxGeometry(part.w, part.h, part.d), material(mark));
        mesh.position.set(col - (cols - 1) / 2, FLOOR_TOP + part.h / 2, row - (rows - 1) / 2);
        mesh.name = `${mark}@${col},${row}`;
        group.add(mesh);
      }
    }
  }
  return group;
}
