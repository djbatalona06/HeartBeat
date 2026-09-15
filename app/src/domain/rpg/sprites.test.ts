import { describe, expect, it } from 'vitest';
import {
  FALLBACK_MASCOT_SPRITE, ISLAND_1_SPRITE_KEYS, PALETTE_KEYS, SPRITES, SPRITE_SIZE,
  hasSprite, spriteFor, spriteKeyForTheme,
} from './sprites';
import { COMPANION_KITS } from './companionSkills';
import { TILE, TILE_KINDS, ZONES } from './zones';
import { ENEMIES } from './enemies';

describe('SPRITES', () => {
  it('draws every sprite square, at the tile size', () => {
    expect(SPRITE_SIZE).toBe(TILE);
    for (const [key, rows] of Object.entries(SPRITES)) {
      expect(rows, key).toHaveLength(SPRITE_SIZE);
      for (const [y, row] of rows.entries()) {
        expect(row.length, `${key} row ${y}`).toBe(SPRITE_SIZE);
      }
    }
  });

  it('uses only palette characters', () => {
    const known = new Set<string>(PALETTE_KEYS);
    for (const [key, rows] of Object.entries(SPRITES)) {
      for (const [y, row] of rows.entries()) {
        for (const [x, char] of [...row].entries()) {
          expect(known.has(char), `${key} (${x},${y}) = ${char}`).toBe(true);
        }
      }
    }
  });

  it('draws something in every sprite', () => {
    // A sprite of pure transparency is a green box waiting to happen.
    for (const [key, rows] of Object.entries(SPRITES)) {
      const painted = rows.join('').split('').filter((c) => c !== '.').length;
      expect(painted, key).toBeGreaterThan(8);
    }
  });

  it('leaves no two sprites identical', () => {
    const drawn = Object.values(SPRITES).map((rows) => rows.join('\n'));
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  // `tile-water` used to be 13 of 16 rows solid 'a' — a loud accent barcode
  // rather than a pond. `accent` is meant for a small glint or detail on a
  // tile, never the majority fill, so pin the ratio directly: this is the
  // regression test for that specific redraw.
  it('never lets accent own more than a third of a tile', () => {
    for (const [key, rows] of Object.entries(SPRITES)) {
      if (!key.startsWith('tile-')) continue;
      const chars = rows.join('').split('');
      const accentShare = chars.filter((c) => c === 'a').length / chars.length;
      expect(accentShare, key).toBeLessThan(1 / 3);
    }
  });
});

/**
 * Eve's Garden's monsters.
 *
 * The seven keys are restated here rather than imported, because the list they
 * have to match lives in C# — `SpriteKey` on each monster in
 * `game/HeartBeat.Game.Core/Data/Island1.cs` — and TypeScript cannot read it.
 * This is the same arrangement `HOLDING_KINDS` has with the endpoint's `KINDS`:
 * two lists across a boundary, and a test as the only thing holding them
 * together. A monster whose sprite key is renamed on one side fails here.
 */
describe("Eve's Garden island 1", () => {
  it('draws all seven of island one', () => {
    expect(ISLAND_1_SPRITE_KEYS).toHaveLength(7);
    for (const key of ISLAND_1_SPRITE_KEYS) {
      expect(hasSprite(key), key).toBe(true);
      expect(spriteFor(key), key).toHaveLength(SPRITE_SIZE);
    }
  });

  it('draws a heavier silhouette the further into the island you get', () => {
    // The island's difficulty curve should be legible without reading a stat
    // block, so the sprites get denser as the stages get harder. Stage 5 is the
    // deliberate breather and is allowed to be the lightest thing on the island
    // — which is exactly why this compares the two ends rather than every pair.
    const painted = (key: string) =>
      (spriteFor(key) ?? []).join('').split('').filter((c) => c !== '.').length;

    expect(painted('sedentary-sentinel')).toBeGreaterThan(painted('sloth-sprout'));
    expect(painted('couch-moss')).toBeGreaterThan(painted('dozing-beetle'));
    expect(painted('dust-drifter')).toBeLessThan(painted('lie-in'));
  });
});

// The drift checks. These are why the data is TypeScript and not a PNG: a
// missing sprite is a failing test rather than a blank square in the garden.
describe('coverage', () => {
  it('draws every tile kind the legend declares', () => {
    for (const kind of TILE_KINDS) {
      expect(hasSprite(kind.sprite), kind.sprite).toBe(true);
    }
  });

  it('draws every enemy in the catalogue', () => {
    for (const enemy of ENEMIES) {
      expect(hasSprite(enemy.id), enemy.id).toBe(true);
    }
  });

  it('draws every enemy standing in a zone', () => {
    for (const zone of ZONES) {
      for (const spot of zone.spots) {
        expect(hasSprite(spot.enemyId), spot.enemyId).toBe(true);
      }
    }
  });

  it('draws every mascot that can be taken through the gate', () => {
    for (const kit of COMPANION_KITS) {
      const key = spriteKeyForTheme(kit.themeId);
      expect(key, kit.themeId).toBe(`mascot-${kit.themeId}`);
      expect(hasSprite(key), key).toBe(true);
    }
  });

  it('falls back to a body rather than an empty tile for a theme it has lost', () => {
    expect(spriteKeyForTheme('a-theme-that-was-removed')).toBe(FALLBACK_MASCOT_SPRITE);
    expect(spriteKeyForTheme(undefined)).toBe(FALLBACK_MASCOT_SPRITE);
    expect(hasSprite(FALLBACK_MASCOT_SPRITE)).toBe(true);
  });

  it('draws the bird facing all four ways', () => {
    for (const facing of ['bird-up', 'bird-down', 'bird-left', 'bird-right']) {
      expect(hasSprite(facing), facing).toBe(true);
    }
  });

  it('has no sprite nothing refers to', () => {
    // The other direction: dead art is still art somebody has to maintain.
    const referenced = new Set<string>([
      ...TILE_KINDS.map((k) => k.sprite),
      ...ENEMIES.map((e) => e.id),
      // Referred to from C#, not from anything TypeScript can follow: these
      // are the `SpriteKey` values in Data/Island1.cs, baked by the Eve's
      // Garden scene. Without them this check reads them as dead art.
      ...ISLAND_1_SPRITE_KEYS,
      'bird-up', 'bird-down', 'bird-left', 'bird-right',
      // One per mascot, resolved by `spriteKeyForTheme` off the theme id, so
      // nothing in TypeScript names them as literals for this to follow.
      ...COMPANION_KITS.map((kit) => spriteKeyForTheme(kit.themeId)),
    ]);
    for (const key of Object.keys(SPRITES)) {
      expect(referenced.has(key), `${key} is drawn but never used`).toBe(true);
    }
  });
});

describe('spriteFor', () => {
  it('finds a sprite that exists', () => {
    expect(spriteFor('bird-down')).toBe(SPRITES['bird-down']);
  });

  it('is total for an unknown key', () => {
    expect(spriteFor('bird-sideways')).toBeUndefined();
    expect(hasSprite('bird-sideways')).toBe(false);
  });
});

describe('the transparent key', () => {
  it('is in the palette, so tiles can show the backdrop through', () => {
    expect(PALETTE_KEYS).toContain('.');
  });
});
