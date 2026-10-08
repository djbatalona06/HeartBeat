import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLES } from '../pet/mascots/3d/gardenPalette';
import { GARDEN_MODEL_FILE, gardenModelSrc } from './gardenModel';

const FILE = resolve(__dirname, '../../../public/media/heartbeat-gardens', GARDEN_MODEL_FILE);

/** The JSON chunk of a binary glTF: 12-byte header, then length, type, payload. */
function gltfJson(): { materials: { name: string }[]; nodes: { name?: string }[] } {
  const b = readFileSync(FILE);
  expect(b.toString('ascii', 0, 4)).toBe('glTF');
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('the garden model', () => {
  it('is in public/, and small enough to be a background', () => {
    expect(existsSync(FILE)).toBe(true);
    expect(readFileSync(FILE).byteLength).toBeLessThan(150 * 1024);
  });

  it('names every material for a role the painter knows, and every role for a material', () => {
    const names = gltfJson().materials.map((m) => m.name).sort();
    expect(names).toEqual([...ROLES].sort());
  });

  it('has the nodes the animation looks for', () => {
    const nodes = gltfJson().nodes.map((n) => n.name ?? '');
    expect(nodes).toContain('canopy');
    expect(nodes.filter((n) => n.startsWith('petal-')).length).toBeGreaterThan(0);
  });

  it('plays with motion allowed', () => {
    expect(gardenModelSrc(false, '/')).toBe('/media/heartbeat-gardens/garden.glb');
  });

  it('keeps the drawn garden for calm and reduced motion', () => {
    expect(gardenModelSrc(true, '/')).toBeNull();
  });

  it('respects a sub-path base', () => {
    expect(gardenModelSrc(false, '/heartbeat/')).toBe('/heartbeat/media/heartbeat-gardens/garden.glb');
  });
});
