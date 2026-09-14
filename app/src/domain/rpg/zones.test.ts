import { describe, expect, it } from 'vitest';
import {
  TILE, TILE_KINDS, ZONES, isWalkable, spotAt, tileAt, tileGrid, zoneFor, zoneHeight,
  zoneWidth, zonesFor,
} from './zones';
import { placeById } from './locations';
import { enemyById } from './enemies';

describe('TILE_KINDS', () => {
  it('gives every kind a unique character and a unique sprite', () => {
    expect(new Set(TILE_KINDS.map((k) => k.char)).size).toBe(TILE_KINDS.length);
    expect(new Set(TILE_KINDS.map((k) => k.sprite)).size).toBe(TILE_KINDS.length);
  });

  it('uses single characters, so a row is one character per tile', () => {
    for (const kind of TILE_KINDS) expect(kind.char).toHaveLength(1);
  });

  it('has something to walk on and something to walk into', () => {
    expect(TILE_KINDS.some((k) => !k.solid)).toBe(true);
    expect(TILE_KINDS.some((k) => k.solid)).toBe(true);
  });
});

describe('ZONES', () => {
  it('keys every zone to a real Place — the drift check', () => {
    // The reason a Zone is a sidecar and not a second catalogue. If a place is
    // renamed or removed, this fails instead of rendering an unnamed map.
    for (const zone of ZONES) {
      expect(placeById(zone.placeId), zone.placeId).toBeDefined();
    }
  });

  it('names each place once', () => {
    expect(new Set(ZONES.map((z) => z.placeId)).size).toBe(ZONES.length);
  });

  it('uses only legend characters', () => {
    const known = new Set(TILE_KINDS.map((k) => k.char));
    for (const zone of ZONES) {
      for (const [y, row] of zone.rows.entries()) {
        for (const [x, char] of [...row].entries()) {
          expect(known.has(char), `${zone.placeId} (${x},${y}) = ${char}`).toBe(true);
        }
      }
    }
  });

  it('is rectangular', () => {
    for (const zone of ZONES) {
      const width = zoneWidth(zone);
      expect(width).toBeGreaterThan(0);
      for (const [y, row] of zone.rows.entries()) {
        expect(row.length, `${zone.placeId} row ${y}`).toBe(width);
      }
    }
  });

  it('is walled all the way round, so the bird cannot walk off the map', () => {
    for (const zone of ZONES) {
      const w = zoneWidth(zone);
      const h = zoneHeight(zone);
      for (let x = 0; x < w; x += 1) {
        expect(isWalkable(zone, x, 0), `${zone.placeId} top ${x}`).toBe(false);
        expect(isWalkable(zone, x, h - 1), `${zone.placeId} bottom ${x}`).toBe(false);
      }
      for (let y = 0; y < h; y += 1) {
        expect(isWalkable(zone, 0, y), `${zone.placeId} left ${y}`).toBe(false);
        expect(isWalkable(zone, w - 1, y), `${zone.placeId} right ${y}`).toBe(false);
      }
    }
  });

  it('spawns the bird somewhere it can stand', () => {
    for (const zone of ZONES) {
      expect(isWalkable(zone, zone.spawn.x, zone.spawn.y), zone.placeId).toBe(true);
    }
  });

  it('stands every enemy on a real enemy id and a walkable tile', () => {
    for (const zone of ZONES) {
      for (const spot of zone.spots) {
        expect(enemyById(spot.enemyId), spot.enemyId).toBeDefined();
        expect(isWalkable(zone, spot.x, spot.y), `${spot.enemyId} at ${spot.x},${spot.y}`)
          .toBe(true);
      }
    }
  });

  it('does not stack two enemies on one tile', () => {
    for (const zone of ZONES) {
      const keys = zone.spots.map((s) => `${s.x},${s.y}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('does not spawn the bird on top of an enemy', () => {
    for (const zone of ZONES) {
      expect(spotAt(zone, zone.spawn.x, zone.spawn.y)).toBeUndefined();
    }
  });
});

describe('tileAt', () => {
  const zone = ZONES[0];

  it('reads the legend', () => {
    expect(tileAt(zone, 0, 0)?.sprite).toBe('tile-hedge');
    expect(tileAt(zone, zone.spawn.x, zone.spawn.y)?.sprite).toBe('tile-gate');
  });

  it('is total off the edge of the map', () => {
    expect(tileAt(zone, -1, 0)).toBeUndefined();
    expect(tileAt(zone, 0, -1)).toBeUndefined();
    expect(tileAt(zone, 9999, 0)).toBeUndefined();
    expect(tileAt(zone, 0, 9999)).toBeUndefined();
  });
});

describe('isWalkable', () => {
  it('treats off-map as solid', () => {
    expect(isWalkable(ZONES[0], -1, -1)).toBe(false);
    expect(isWalkable(ZONES[0], 9999, 9999)).toBe(false);
  });
});

describe('tileGrid', () => {
  it('matches the rows in shape', () => {
    for (const zone of ZONES) {
      const grid = tileGrid(zone);
      expect(grid).toHaveLength(zoneHeight(zone));
      for (const row of grid) expect(row).toHaveLength(zoneWidth(zone));
    }
  });

  it('maps characters to their legend index', () => {
    const hedge = TILE_KINDS.findIndex((k) => k.char === '#');
    expect(tileGrid(ZONES[0])[0][0]).toBe(hedge);
  });
});

describe('zoneFor', () => {
  it('finds the garden', () => {
    expect(zoneFor('place-garden')).toBe(ZONES[0]);
  });

  it('is total for a place with no zone, or none at all', () => {
    expect(zoneFor('place-observatory')).toBeUndefined();
    expect(zoneFor(undefined)).toBeUndefined();
  });
});

describe('zonesFor', () => {
  it('opens the garden at level 1, because there is always somewhere', () => {
    expect(zonesFor(1).map((z) => z.placeId)).toContain('place-garden');
  });

  it('defers the unlock rule to locations.ts rather than restating it', () => {
    for (const zone of ZONES) {
      const place = placeById(zone.placeId)!;
      expect(zonesFor(place.unlockLevel).map((z) => z.placeId)).toContain(zone.placeId);
      if (place.unlockLevel > 1) {
        expect(zonesFor(place.unlockLevel - 1).map((z) => z.placeId)).not.toContain(zone.placeId);
      }
    }
  });
});

describe('TILE', () => {
  it('is the 16 the sprites are drawn at', () => {
    expect(TILE).toBe(16);
  });
});
