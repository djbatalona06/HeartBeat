import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The gear drawings are a lazy chunk, reached only through `GearIcon`. A single
 * static import of the registry from anywhere else folds all forty drawings
 * back into the entry chunk -- silently, because everything still renders --
 * and the first anybody hears of it is the precache ceiling. Components are not
 * unit-tested by design, so this reads the source, as `art.test.ts` does.
 */
const SRC = resolve(__dirname, '../../../../');
const GEAR_DIR = __dirname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('gear art stays a lazy chunk', () => {
  it('is imported at runtime by nothing but the lazy door', () => {
    // Every import path that reaches into art/gear, from a file outside it.
    const reaching = (source: string) =>
      [...source.matchAll(/from\s+['"]([^'"]*art\/gear(?:\/[^'"]*)?)['"]/g)].map((m) => m[1]);
    const offenders = walk(SRC)
      .filter((file) => !file.startsWith(GEAR_DIR + sep))
      .filter((file) => reaching(readFileSync(file, 'utf8')).some((path) => !path.endsWith('/GearIcon')));
    expect(offenders.map((f) => f.replace(SRC, ''))).toEqual([]);
  });

  it('reaches the registry only through a dynamic import in GearIcon', () => {
    const door = readFileSync(join(GEAR_DIR, 'GearIcon.tsx'), 'utf8');
    expect(door).toContain("import('./gear-art')");
    expect(door).not.toMatch(/from\s+['"]\.\/(gear-art|index)['"]/);
  });

  it('keeps the lazy entry as the registry\'s only public surface', () => {
    const entry = readFileSync(join(GEAR_DIR, 'gear-art.ts'), 'utf8');
    expect(entry).toMatch(/export\s+\{\s*gearArt\s*\}\s+from\s+['"]\.\/index['"]/);
  });
});
