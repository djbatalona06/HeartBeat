/**
 * Every 3D mascot is built here in Node, without a GPU — three.js assembles
 * geometry happily with no renderer — so a builder that throws, a face that
 * went missing, or a borrowed name fails a test rather than a phone.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { FALLBACK_MASCOT_ID, MASCOT_ROSTER } from '../roster';
import { MODELS, buildMascot } from './models';
import { paints } from './rig';

/** The same list `roster.test.ts` refuses, for the same reason. */
const BORROWED = /hello kitty|sanrio|spongebob|naruto|pikachu|mickey/i;

function meshes(o: Object3D): number {
  let n = 0;
  o.traverse((c) => { if (c instanceof Mesh) n += 1; });
  return n;
}

describe('MODELS', () => {
  it('builds a model for every mascot on the roster', () => {
    expect(Object.keys(MODELS).sort()).toEqual(Object.keys(MASCOT_ROSTER).sort());
  });

  for (const id of Object.keys(MODELS)) {
    it(`gives ${id} a figure, a face for each mood, and eyes that blink`, () => {
      const p = paints();
      const rig = buildMascot(id, p.paint);
      expect(meshes(rig.root)).toBeGreaterThan(10);
      for (const mood of ['happy', 'content', 'sleepy'] as const) {
        expect(meshes(rig.faces[mood]), mood).toBeGreaterThan(0);
        // Faces hang inside the figure, or turning the head would leave them behind.
        let attached = false;
        rig.root.traverse((c) => { if (c === rig.faces[mood]) attached = true; });
        expect(attached, mood).toBe(true);
      }
      expect(rig.lids.length).toBe(2);
      p.dispose();
    });
  }

  it('falls back to the fallback mascot for a theme id it has never seen', () => {
    const p = paints();
    const unknown = buildMascot('a-theme-that-was-removed', p.paint);
    const fallback = buildMascot(FALLBACK_MASCOT_ID, p.paint);
    expect(meshes(unknown.root)).toBe(meshes(fallback.root));
  });

  it('names nobody else\'s character anywhere in the models', () => {
    const dir = __dirname;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(BORROWED);
    }
  });
});
