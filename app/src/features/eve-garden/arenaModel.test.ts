import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../../domain/rpg/arena';
import { ARENA_ROLES } from '../pet/mascots/3d/arenaPalette';
import { ARENA_MODEL_FILE, arenaModelSrc } from './arenaFloor';

const FILE = resolve(__dirname, '../../../public/media/heartbeat-gardens', ARENA_MODEL_FILE);

interface Gltf {
  materials: { name: string }[];
  nodes: { name?: string; mesh?: number }[];
  meshes: { primitives: { attributes: { POSITION: number } }[] }[];
  accessors: { min?: number[]; max?: number[] }[];
}

/** The JSON chunk of a binary glTF: 12-byte header, then length, type, payload. */
function gltf(): Gltf {
  const b = readFileSync(FILE);
  expect(b.toString('ascii', 0, 4)).toBe('glTF');
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('the arena model', () => {
  it('is in public/, and small enough to be a floor', () => {
    expect(existsSync(FILE)).toBe(true);
    expect(readFileSync(FILE).byteLength).toBeLessThan(40 * 1024);
  });

  it('names every material for a role the painter knows, and every role for a material', () => {
    expect(gltf().materials.map((m) => m.name).sort()).toEqual([...ARENA_ROLES].sort());
  });

  it('has the three meshes the bake expects', () => {
    expect(gltf().nodes.map((n) => n.name ?? '').sort()).toEqual(['grout', 'tilesA', 'tilesB']);
  });

  /** The picture and the walkable grid must be one grid: the board is exactly the arena, centred. */
  it('is exactly as wide and as deep as the arena grid', () => {
    const g = gltf();
    const grout = g.nodes.find((n) => n.name === 'grout')!;
    const accessor = g.accessors[g.meshes[grout.mesh!].primitives[0].attributes.POSITION];
    expect(accessor.min![0]).toBeCloseTo(-ARENA_WIDTH / 2, 3);
    expect(accessor.max![0]).toBeCloseTo(ARENA_WIDTH / 2, 3);
    expect(accessor.min![2]).toBeCloseTo(-ARENA_HEIGHT / 2, 3);
    expect(accessor.max![2]).toBeCloseTo(ARENA_HEIGHT / 2, 3);
  });
});

describe('where the floor is served from', () => {
  it('plays with motion allowed', () => {
    expect(arenaModelSrc(false, false, '/')).toBe('/media/heartbeat-gardens/arena.glb');
  });

  it('makes no request at all for calm, reduced motion or Save-Data', () => {
    expect(arenaModelSrc(true, false, '/')).toBeNull();
    expect(arenaModelSrc(false, true, '/')).toBeNull();
  });

  it('respects a sub-path base', () => {
    expect(arenaModelSrc(false, false, '/heartbeat/')).toBe('/heartbeat/media/heartbeat-gardens/arena.glb');
  });
});
