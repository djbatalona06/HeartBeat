import { placeById } from './locations';

/**
 * Somewhere to stand, hung off somewhere to go.
 *
 * A zone is **not** a new `Place`. `PLACES` in `locations.ts` already holds the
 * catalogue — id, name, blurb, `unlockLevel`, `surcharge`, `bounty` — and
 * `placesFor`, `canTravel` and `Avatar.visited` are already written and tested
 * against it. A parallel list of the same nouns would be a second catalogue, a
 * second unlock rule and a second thing to keep in step, which is the exact
 * failure `nav.ts` and `art.test.ts` both exist to prevent. So a `Zone` is a
 * sidecar keyed by `Place.id` — the pattern `features/party/art/pets` uses to
 * hang art off `PET_KINDS` — and `place-garden` *is* the first zone, which is
 * why it was the one at `unlockLevel: 1, surcharge: 0` to begin with.
 *
 * `locations.ts` is not edited by any of this.
 *
 * ## Why characters and not numbers
 *
 * The rows are authored as text because a map is the one kind of data where the
 * diff should look like the thing. A hedge moving one tile left is visible in a
 * row of characters and invisible in a row of integers. Phaser wants
 * `number[][]` for `make.tilemap({ data })`, so `tileGrid` converts on the way
 * out — once, at scene boot.
 *
 * ## What is deliberately not here
 *
 * The other nine zones, Tiled JSON, a tilemap loader and EasyStar.js. Fifteen
 * rows of text in this file is the whole map; pathfinding is for click-to-move
 * or a chasing NPC and the slice has neither. The tenth zone is a data edit when
 * somebody wants one.
 */

/** Pixels per tile. 16 is the sprite size, and the grid is the sprite grid. */
export const TILE = 16;

/**
 * The legend. Index is what Phaser's tilemap sees; `solid` is what stops a bird.
 *
 * Order is load-bearing — the index *is* the position in this array, and
 * `sprites.ts` keys its tile art off `sprite` — so tiles are appended, never
 * reordered.
 */
export interface TileKind {
  char: string;
  /** Sprite key in `sprites.ts`. */
  sprite: string;
  solid: boolean;
}

export const TILE_KINDS: readonly TileKind[] = [
  { char: '.', sprite: 'tile-grass', solid: false },
  { char: ',', sprite: 'tile-path', solid: false },
  { char: '#', sprite: 'tile-hedge', solid: true },
  { char: '~', sprite: 'tile-water', solid: true },
  { char: '*', sprite: 'tile-bed', solid: false },
  { char: 'o', sprite: 'tile-stone', solid: true },
  { char: '=', sprite: 'tile-gate', solid: false },
];

const BY_CHAR = new Map(TILE_KINDS.map((kind, index) => [kind.char, index]));

export interface Spot {
  enemyId: string;
  x: number;
  y: number;
}

export interface Zone {
  /** A `Place.id` from `locations.ts`. Name and unlock level live there. */
  placeId: string;
  /** Rows of `TILE_KINDS` characters. Every row the same length. */
  rows: readonly string[];
  /** Where the bird stands on arrival, in tiles. */
  spawn: { x: number; y: number };
  /** Who is standing about, and where. */
  spots: readonly Spot[];
}

export const ZONES: readonly Zone[] = [
  {
    placeId: 'place-garden',
    rows: [
      '####################',
      '#..................#',
      '#..,,,,,,,,,,,,,,..#',
      '#..,............,..#',
      '#..,..~~~~~~....,..#',
      '#..,..~~~~~~....,..#',
      '#..,..~~~~~~....,..#',
      '#..,............,..#',
      '#..,....o.o.....,..#',
      '#..,,,,,,,,,,,,,,..#',
      '#..**...........**.#',
      '#..**...........**.#',
      '#..................#',
      '#........==........#',
      '####################',
    ],
    spawn: { x: 9, y: 13 },
    spots: [
      { enemyId: 'foe-snail', x: 5, y: 3 },
      { enemyId: 'foe-magpie', x: 13, y: 8 },
      { enemyId: 'foe-wasp', x: 10, y: 11 },
    ],
  },
];

const BY_PLACE = new Map(ZONES.map((z) => [z.placeId, z]));

/** Total, the way `placeById` is: somewhere with no zone is simply not walkable. */
export function zoneFor(placeId: string | undefined): Zone | undefined {
  return placeId ? BY_PLACE.get(placeId) : undefined;
}

export function zoneWidth(zone: Zone): number {
  return zone.rows[0]?.length ?? 0;
}

export function zoneHeight(zone: Zone): number {
  return zone.rows.length;
}

/** The kind at a tile, or `undefined` off the edge of the map. */
export function tileAt(zone: Zone, x: number, y: number): TileKind | undefined {
  const row = zone.rows[y];
  if (row === undefined) return undefined;
  const char = row[x];
  if (char === undefined) return undefined;
  const index = BY_CHAR.get(char);
  return index === undefined ? undefined : TILE_KINDS[index];
}

/**
 * Can the bird stand here?
 *
 * Off the map is not walkable, which means the hedge border is belt and braces
 * rather than the only thing holding the bird in.
 */
export function isWalkable(zone: Zone, x: number, y: number): boolean {
  const kind = tileAt(zone, x, y);
  return kind !== undefined && !kind.solid;
}

/** The map as Phaser wants it. Converted once, at scene boot. */
export function tileGrid(zone: Zone): number[][] {
  return zone.rows.map((row) => [...row].map((char) => BY_CHAR.get(char) ?? 0));
}

/** Whoever is standing on this tile, if anyone. */
export function spotAt(zone: Zone, x: number, y: number): Spot | undefined {
  return zone.spots.find((spot) => spot.x === x && spot.y === y);
}

/** The zones open at a level. Delegates the rule to `locations.ts`. */
export function zonesFor(level: number): Zone[] {
  return ZONES.filter((zone) => {
    const place = placeById(zone.placeId);
    return place !== undefined && place.unlockLevel <= level;
  });
}
