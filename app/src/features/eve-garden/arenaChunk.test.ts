import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ISLAND_1_ARENAS, ARENA_HEIGHT, ARENA_WIDTH } from '../../domain/rpg/arena';
import { FLOOR_CACHE_MAX, arenaLayout, boardCacheKey, floorCacheKey, remember } from './arenaFloor';

/**
 * Eve's Garden may import the arena floor's colour maths, and must never import
 * three.js to get it.
 *
 * `vite.config.ts` sends everything under `mascots/3d/` to the lazy `mascot3d`
 * chunk. A route that value-imports one of those files therefore imports the
 * whole chunk, three.js included, even on a phone that is on Save-Data. The
 * four files that import no three.js go to their own chunk instead; these tests
 * hold that list, the files and the route in step without needing a build.
 */

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const PURE = ['arenaPalette', 'arenaFinish', 'cssColor', 'gardenPalette'];
const THREE_DIR = '../pet/mascots/3d/';

/** Every module specifier a file imports as a value (type-only imports are erased). */
function valueImports(source: string): string[] {
  return [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((m) => m[1]);
}

describe('the arena floor keeps three.js out of the route', () => {
  it('names exactly the pure files in the Vite chunk rule', () => {
    const config = read('../../../vite.config.ts');
    const rule = config.match(/mascots\\\/3d\\\/\(([^)]*)\)/);
    expect(rule, 'the arena-paint rule is missing from vite.config.ts').not.toBeNull();
    expect(rule![1].split('|').sort()).toEqual([...PURE].sort());
  });

  it.each(PURE)('%s imports nothing from three', (name) => {
    const imports = valueImports(read(`${THREE_DIR}${name}.ts`));
    expect(imports.filter((spec) => spec.startsWith('three'))).toEqual([]);
    // And only its pure siblings, so the chunk cannot grow a path to three.js.
    for (const spec of imports) {
      expect(spec.startsWith('./') ? spec.slice(2) : spec).toSatisfy((s: string) => PURE.includes(s));
    }
  });

  it.each(['arenaFloor.ts', 'arenaCanvas.ts', 'EveGardenPage.tsx', 'arenaTheme.ts'])(
    '%s value-imports only the pure files from 3d/',
    (file) => {
      const fromThree = valueImports(read(`./${file}`)).filter((spec) => spec.includes('mascots/3d/'));
      for (const spec of fromThree) {
        const name = spec.split('/').pop()!;
        // The one allowed route in is a dynamic `import()`, which is not matched here.
        expect(PURE, `${file} imports ${spec}`).toContain(name);
      }
    },
  );
});

describe('the baked floor cache', () => {
  const tokens = { base: '#111', text: '#eee', accent: '#f0a', success: '#0f0', danger: '#f00' };

  it('is keyed by the five colours and nothing else', () => {
    expect(floorCacheKey(tokens)).toBe(floorCacheKey({ ...tokens }));
    expect(floorCacheKey(tokens)).not.toBe(floorCacheKey({ ...tokens, accent: '#0af' }));
  });

  it('is keyed by the stage too, so one stage never shows another stage\'s hedges', () => {
    const [meadow, pond] = ISLAND_1_ARENAS;
    expect(boardCacheKey(tokens, meadow)).toBe(boardCacheKey(tokens, { ...meadow }));
    expect(boardCacheKey(tokens, meadow)).not.toBe(boardCacheKey(tokens, pond));
    expect(boardCacheKey(tokens, meadow)).not.toBe(boardCacheKey({ ...tokens, accent: '#0af' }, meadow));
  });

  it('reads each stage\'s layout through the arena grid, the shape of the board', () => {
    const layout = arenaLayout(ISLAND_1_ARENAS[1]);
    expect(layout).toHaveLength(ARENA_HEIGHT);
    for (const row of layout) expect(row).toHaveLength(ARENA_WIDTH);
    expect(layout[0][0]).toBe('tile-hedge');
    expect(layout[2][4]).toBe('tile-water');
  });

  it('keeps the most recent few and drops the oldest', () => {
    const cache = new Map<string, number>();
    for (let i = 0; i < FLOOR_CACHE_MAX + 2; i += 1) remember(cache, `k${i}`, i);
    expect(cache.size).toBe(FLOOR_CACHE_MAX);
    expect(cache.has('k0')).toBe(false);
    expect(cache.has(`k${FLOOR_CACHE_MAX + 1}`)).toBe(true);
  });

  it('treats a repeat as fresh, so a floor in use is not the one dropped', () => {
    const cache = new Map<string, number>();
    // A cache of three, named here: the rule under test is the eviction order, not the app's size.
    remember(cache, 'a', 1, 3);
    remember(cache, 'b', 2, 3);
    remember(cache, 'c', 3, 3);
    remember(cache, 'a', 1, 3); // used again
    remember(cache, 'd', 4, 3); // pushes out the oldest, which is now b
    expect([...cache.keys()]).toEqual(['c', 'a', 'd']);
  });
});
