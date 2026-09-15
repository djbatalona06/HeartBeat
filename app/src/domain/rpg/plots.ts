import { unlockedPlots } from './milestones';
import { tierForPrice } from './raidStats';
import type { RaidStatKey } from './raidStats';
import type { Tier } from './tiers';

/**
 * The garden's ground, and the things you put in it.
 *
 * ## Why this is not the birbhouse
 *
 * `furniture.ts` already places things — in a *room*. The obvious move was to
 * let the garden take the same catalogue, and it is wrong for one plain
 * reason: a rainy window and a round rug do not go outdoors. Moving the living
 * room onto the lawn would have been a shortcut that showed.
 *
 * So the garden has its own catalogue of things you grow or stand in soil, and
 * it is deliberately a *small* one. Six plots and eight things, because a
 * garden with forty slots is a spreadsheet, and because every one of these has
 * to be drawn.
 *
 * ## Plots open as the pet levels
 *
 * A plot is not bought, it is **reached** — `milestones.ts` hands them over at
 * levels 2, 4, 8, 12, 18, 23 and 28. That is what makes the garden fill out at
 * the rate the two of you do, and it is the answer to "what is a fifty-level
 * curve actually for": the ground you are standing on gets bigger.
 *
 * ## Everything planted carries a stat
 *
 * Same rule as everywhere else (`raidStats.ts`), and by the same route: the
 * rung comes from the price, so nobody has to keep a tier column in step with
 * a coin column. Nothing here touches Burden — a garden does not help you hit
 * anything, which is the same ruling `FURNITURE_RAID_ORDER` already made.
 */

export interface Plot {
  id: string;
  name: string;
  blurb: string;
  /** Left to right across the garden, -1 to 1. Read by the backdrop. */
  x: number;
  /** How far back, 0 at the front. */
  depth: number;
  /** What each plot leans on, best first. Where it *is* decides what it is for. */
  order: readonly RaidStatKey[];
}

/**
 * Six, in the order `milestones.ts` opens them.
 *
 * The positions are hand-placed rather than laid out on a curve, unlike the
 * Raid Gate's arch — an arch is a formal arrangement and a garden is not, and
 * six evenly spaced beds would read as an allotment.
 */
export const PLOTS: readonly Plot[] = [
  {
    id: 'plot-doorstep',
    name: 'The doorstep',
    blurb: 'Small, and the first thing either of you sees.',
    x: -0.72, depth: 0.05,
    order: ['resonance', 'reveal', 'recovery', 'energy'],
  },
  {
    id: 'plot-pondside',
    name: 'Pondside',
    blurb: 'Soft ground by the water. It will grow almost anything.',
    x: 0.58, depth: 0.35,
    order: ['recovery', 'resilience', 'resonance', 'fortify'],
  },
  {
    id: 'plot-the-verge',
    name: 'The verge',
    blurb: 'Along the path in. Nothing important grows here, which is the charm.',
    x: -0.18, depth: 0.12,
    order: ['energy', 'recovery', 'reveal', 'resonance'],
  },
  {
    id: 'plot-under-the-trees',
    name: 'Under the trees',
    blurb: 'Shade most of the day. Fussy, and worth the fuss.',
    x: 0.14, depth: 0.68,
    order: ['fortify', 'resilience', 'reveal', 'recovery'],
  },
  {
    id: 'plot-the-far-corner',
    name: 'The far corner',
    blurb: 'Out of sight of the gate. Something ought to be down there.',
    x: 0.86, depth: 0.82,
    order: ['reveal', 'resonance', 'energy', 'fortify'],
  },
  {
    id: 'plot-the-old-bed',
    name: 'The old bed',
    blurb: 'Somebody planted here once. Whatever it was is long gone.',
    x: -0.46, depth: 0.55,
    order: ['resilience', 'fortify', 'recovery', 'energy'],
  },
  {
    id: 'plot-the-long-border',
    name: 'The long border',
    blurb: 'The whole south edge. The last of the ground, and the best of it.',
    x: 0.0, depth: 0.92,
    order: ['resilience', 'resonance', 'fortify', 'reveal'],
  },
];

const PLOT_BY_ID = new Map(PLOTS.map((plot) => [plot.id, plot]));

export function plotById(id: string | undefined): Plot | undefined {
  return id ? PLOT_BY_ID.get(id) : undefined;
}

/** The plots a couple has actually reached, in the order they reached them. */
export function plotsAt(petLevel: number): Plot[] {
  return unlockedPlots(petLevel)
    .map((id) => plotById(id))
    .filter((plot): plot is Plot => plot !== undefined);
}

/* -- what grows in them ------------------------------------------------------ */

export interface Flora {
  /** Prefixed, so the one generic `inventory` table can hold it beside gear,
   *  dyes and decor without a `kind` column. Same trick as `DECOR_PREFIX`. */
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Drawn by `GardenBackdrop`. A shape key, not a path. */
  art: 'bed' | 'post' | 'bench' | 'bath' | 'chime' | 'tree' | 'stone' | 'hive';
}

/** Keeps flora from colliding with gear, dyes and decor in `inventory`. */
export const FLORA_PREFIX = 'flora-';

/**
 * Eight, at four prices.
 *
 * Priced against the gear ladder in `shop.ts`, which is what gives each its
 * rung: 90 is rare, 220 epic, 500 legendary. Nothing here is mythic, and that
 * is not an oversight — the top rung should be something you won, not something
 * you saved up for, and `KIND_TIERS` in `chests.ts` reads this catalogue to
 * work out that a gilded chest cannot hand you a mythic rose.
 */
export const FLORA: readonly Flora[] = [
  {
    id: 'flora-rose-bed', name: 'Rose bed', art: 'bed', price: 90,
    blurb: 'Thorny, demanding, and worth it about three weeks a year.',
  },
  {
    id: 'flora-lantern-post', name: 'Lantern post', art: 'post', price: 90,
    blurb: 'Lit at dusk whether or not anybody is expected.',
  },
  {
    id: 'flora-stone-bench', name: 'Stone bench', art: 'bench', price: 220,
    blurb: 'Cold in the morning, warm by four, sat on mostly at four.',
  },
  {
    id: 'flora-birdbath', name: 'Birdbath', art: 'bath', price: 220,
    blurb: 'Filled every few days by one of you. Neither says which.',
  },
  {
    id: 'flora-wind-chime', name: 'Wind chime', art: 'chime', price: 220,
    blurb: 'Audible from the kitchen. That is the entire function.',
  },
  {
    id: 'flora-standing-stone', name: 'Standing stone', art: 'stone', price: 500,
    blurb: 'Here before the garden was. Nobody has tried to move it twice.',
  },
  {
    id: 'flora-beehive', name: 'Beehive', art: 'hive', price: 500,
    blurb: 'A great deal of work happening that neither of you is doing.',
  },
  {
    id: 'flora-fruit-tree', name: 'Fruit tree', art: 'tree', price: 500,
    blurb: 'Planted for whoever is here in fifteen years. Possibly you.',
  },
];

const FLORA_BY_ID = new Map(FLORA.map((flora) => [flora.id, flora]));

export function floraById(id: string | undefined): Flora | undefined {
  return id ? FLORA_BY_ID.get(id) : undefined;
}

/** The rung a plant sits on, read off its price like furniture and dyes. */
export function floraTier(flora: Flora): Tier {
  return tierForPrice(flora.price);
}

/* -- what is planted where --------------------------------------------------- */

/** Plot id to flora id. An empty plot is simply absent. */
export type Garden = Partial<Record<string, string>>;

/**
 * Drop a stored garden to only what is still real *and still reachable*.
 *
 * Three things it throws away, and the third is the one that matters. A plant
 * retired from the catalogue is dropped; a plant filed under a plot that does
 * not exist is dropped; and **a plant in a plot this couple has not levelled
 * into is dropped**, which is what stops a garden restored from an older,
 * higher-levelled state from showing ground its owners cannot reach.
 *
 * That last case is real rather than theoretical: the plot ladder is derived
 * from pet XP, and pet XP is reconciled against the server — so a device can
 * briefly hold a garden that is ahead of the level it can prove.
 */
export function normalizeGarden(garden: Garden | undefined, petLevel: number): Garden {
  const out: Garden = {};
  if (!garden) return out;
  const reachable = new Set(plotsAt(petLevel).map((plot) => plot.id));
  for (const [plotId, floraId] of Object.entries(garden)) {
    if (!reachable.has(plotId)) continue;
    if (!floraById(floraId)) continue;
    out[plotId] = floraId;
  }
  return out;
}

/** Plant something, or clear a plot by passing `undefined`. Pure. */
export function plantIn(
  garden: Garden | undefined,
  petLevel: number,
  plotId: string,
  floraId: string | undefined,
): Garden {
  const next = normalizeGarden(garden, petLevel);
  if (!plotById(plotId)) return next;
  if (!plotsAt(petLevel).some((plot) => plot.id === plotId)) return next;
  if (!floraId) {
    delete next[plotId];
    return next;
  }
  if (!floraById(floraId)) return next;
  next[plotId] = floraId;
  return next;
}

/** Plots reached but still bare. What the garden is asking you for. */
export function emptyPlots(garden: Garden | undefined, petLevel: number): Plot[] {
  const planted = normalizeGarden(garden, petLevel);
  return plotsAt(petLevel).filter((plot) => planted[plot.id] === undefined);
}
