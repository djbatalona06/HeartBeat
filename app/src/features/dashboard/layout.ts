/**
 * The home screen's ring: what sits on it, and where each thing goes.
 *
 * Worth testing because "evenly spaced around the pet" is the one claim the
 * front door makes and the one a screenshot cannot prove. Overlap on a short
 * phone, a start angle that drifts as the number of doors changes, a mascot
 * quietly squeezed to nothing — all three are arithmetic, and all three stay
 * invisible until the layout is already wrong on somebody's phone.
 *
 * Everything here is pure. No `document`, no `window`: the caller measures the
 * box and hands it over, so the geometry can be checked in a node test.
 */

/** A door on the ring. Glyphs come from the same abstract set as the tab bar. */
export interface HomeDestination {
  /** Router path, exactly as `App.tsx` declares it. */
  to: string;
  label: string;
  glyph: string;
}

/**
 * Six, and six is the ceiling — past that the bubbles crowd the pet and the
 * ring stops reading as a ring.
 *
 * The right-hand arc is what you did today; the left-hand arc is everything
 * else. Party earns the sixth slot because it is the only route in the app
 * with neither a tab nor a door on this screen — its one entrance today is a
 * link at the bottom of Tasks, and Tasks already has a tab of its own.
 */
export const HOME_DESTINATIONS: HomeDestination[] = [
  { to: '/mood', label: 'Mood', glyph: '◑' },
  { to: '/exercise', label: 'Move', glyph: '▲' },
  { to: '/work', label: 'Work', glyph: '▦' },
  { to: '/cycle', label: 'Cycle', glyph: '☾' },
  { to: '/party', label: 'Party', glyph: '◈' },
  { to: '/settings', label: 'Settings', glyph: '☰' },
];

export interface RingBox {
  width: number;
  height: number;
}

export interface RingSpec {
  /** How many bubbles to place. */
  count: number;
  /** The box the ring has to live inside, in px. */
  box: RingBox;
  /** Diameter of one bubble, in px. Never below the 48px tap floor. */
  bubble: number;
  /** Clear air kept between neighbours, and between a bubble and the mascot. */
  gap: number;
  /** Degrees clockwise from twelve o'clock. Defaults to 0 — first door straight up. */
  startAngle?: number;
}

export interface RingSlot {
  index: number;
  /** Degrees clockwise from twelve o'clock. */
  angle: number;
  /** Bubble centre, px from the top-left of the box. */
  x: number;
  y: number;
}

export interface Ring {
  /** Ring centre, px from the top-left of the box. The mascot's centre too. */
  centre: { x: number; y: number };
  /** Centre to bubble centre, px. */
  radius: number;
  /** Diameter of the clear circle left in the middle, px — the mascot's size. */
  mascot: number;
  /** Shortest edge-to-edge distance between two neighbours, px. Infinite under two bubbles. */
  clearance: number;
  /** False when the box is too small to seat the ring without crowding. */
  fits: boolean;
  slots: RingSlot[];
}

/** Screen coordinates put 0° at three o'clock; the ring starts at twelve. */
const TWELVE_OCLOCK = -90;

/** Sub-pixel noise in a style attribute helps nobody and makes diffs lie. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Seat `count` bubbles evenly around the centre of `box`.
 *
 * The radius is whatever keeps every bubble wholly inside the box, so the ring
 * is as wide as it is allowed to be and the mascot takes the rest. The first
 * bubble is always straight up: a door at twelve o'clock reads as a decision,
 * one at 37° reads as an accident.
 */
export function ringLayout(spec: RingSpec): Ring {
  const count = Math.max(0, Math.trunc(spec.count));
  const bubble = Math.max(0, spec.bubble);
  const gap = Math.max(0, spec.gap);
  const start = spec.startAngle ?? 0;

  const centre = { x: round(spec.box.width / 2), y: round(spec.box.height / 2) };
  const radius = Math.max(0, Math.min(spec.box.width, spec.box.height) / 2 - bubble / 2);

  const step = count > 0 ? 360 / count : 0;
  const slots: RingSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = start + index * step;
    const radians = ((angle + TWELVE_OCLOCK) * Math.PI) / 180;
    slots.push({
      index,
      angle: round(angle),
      x: round(centre.x + radius * Math.cos(radians)),
      y: round(centre.y + radius * Math.sin(radians)),
    });
  }

  // The chord between neighbouring centres, less one whole bubble, is the air
  // between them. Under two bubbles there are no neighbours to crowd.
  const clearance =
    count > 1 ? round(2 * radius * Math.sin(Math.PI / count) - bubble) : Number.POSITIVE_INFINITY;
  const mascot = Math.max(0, round(2 * (radius - bubble / 2 - gap)));

  return {
    centre,
    radius: round(radius),
    mascot,
    clearance,
    fits: count === 0 || (clearance >= gap && mascot > 0),
    slots,
  };
}
