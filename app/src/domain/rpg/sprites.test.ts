import { describe, expect, it } from 'vitest';
import { PALETTE_KEYS, SPRITES, SPRITE_SIZE, hasSprite, spriteFor } from './sprites';
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
      'bird-up', 'bird-down', 'bird-left', 'bird-right',
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
