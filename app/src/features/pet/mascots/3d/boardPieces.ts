import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SRGBColorSpace,
  type BufferGeometry,
} from 'three';
import type { PieceRole } from './arenaPalette';
import type { Rgb } from './gardenPalette';
import { FLOOR_TOP } from './boardCamera';

/**
 * The things that stand on the battle board: hedge, stone, water, beds and the
 * gate, drawn as small solids on top of the checkerboard.
 *
 * Built in code rather than stored in `arena.glb`. The file stays exactly the
 * floor it was (its materials are checked against `ARENA_ROLES`), and a piece is
 * a box or a frustum a few lines long. Each is coloured by its role from the
 * pack's tokens (`arenaPaint(...).pieces`), so a piece is never a colour the
 * pack did not already own.
 *
 * Takes sprite names rather than tile characters, so this file imports nothing
 * from outside `3d/`: the caller reads the grid with `tileKindAt`, the one
 * authority, and hands over what it found in each cell.
 */

/** Nothing stands taller than this, in tiles. A tall piece leans over the row above it. */
export const MAX_LIFT = 0.35;

export interface PieceSpec {
  role: PieceRole;
  shape: 'block' | 'frustum' | 'plate';
  /** Height above the floor's top, in tiles. */
  height: number;
  /** Footprint as a fraction of the tile: 1 fills the cell. */
  fill: number;
}

/** The sprite names the board draws as pieces. Grass and path are the checkerboard itself. */
export const PIECE_SPRITES = ['tile-hedge', 'tile-stone', 'tile-water', 'tile-bed', 'tile-gate'] as const;

const onEdge = (col: number, row: number, cols: number, rows: number) =>
  col === 0 || row === 0 || col === cols - 1 || row === rows - 1;

/** What stands in a cell, or undefined when the cell is plain floor. */
export function pieceSpec(
  sprite: string | undefined,
  col: number,
  row: number,
  cols: number,
  rows: number,
): PieceSpec | undefined {
  switch (sprite) {
    // The ring of hedge round the board is lower than a hedge in the middle of
    // it, so the frame does not wall the picture in.
    case 'tile-hedge':
      return { role: 'hedge', shape: 'block', height: onEdge(col, row, cols, rows) ? 0.18 : 0.3, fill: 1 };
    case 'tile-stone':
      return { role: 'stone', shape: 'frustum', height: 0.3, fill: 0.86 };
    // Water is level with the floor and a shade in from the cell's edge, so a
    // rim of floor frames it; the colour does the "sunken".
    case 'tile-water':
      return { role: 'water', shape: 'plate', height: 0.015, fill: 0.84 };
    case 'tile-bed':
      return { role: 'bed', shape: 'frustum', height: 0.1, fill: 0.78 };
    case 'tile-gate':
      return { role: 'gate', shape: 'plate', height: 0.05, fill: 0.9 };
    default:
      return undefined;
  }
}

function geometryFor(spec: PieceSpec): BufferGeometry {
  if (spec.shape === 'frustum') {
    // A four-sided taper, turned so its flat sides face the grid, like the floor's tiles.
    const g = new CylinderGeometry((spec.fill * 0.62), (spec.fill * 0.72), spec.height, 4, 1);
    g.rotateY(Math.PI / 4);
    return g;
  }
  return new BoxGeometry(spec.fill, spec.height, spec.fill);
}

/**
 * `layout[row][col]` is the sprite name in that cell (or undefined). The group
 * is centred on the origin the way `arena.glb` is: tile (col, row) at
 * x = col - (cols - 1) / 2, z = row - (rows - 1) / 2.
 */
export function buildBoardPieces(
  layout: readonly (readonly (string | undefined)[])[],
  colors: Record<PieceRole, Rgb>,
): Group {
  const group = new Group();
  group.name = 'pieces';
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  const materials = new Map<PieceRole, MeshStandardMaterial>();
  const material = (role: PieceRole) => {
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
      const spec = pieceSpec(layout[row][col], col, row, cols, rows);
      if (!spec) continue;
      const mesh = new Mesh(geometryFor(spec), material(spec.role));
      mesh.position.set(col - (cols - 1) / 2, FLOOR_TOP + spec.height / 2, row - (rows - 1) / 2);
      mesh.name = `${spec.role}@${col},${row}`;
      group.add(mesh);
    }
  }
  return group;
}
