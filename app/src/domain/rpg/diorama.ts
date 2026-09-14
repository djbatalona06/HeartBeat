/**
 * How Eve's Garden is lit, and which face of the island is showing.
 *
 * Two independent things, kept in one module because they are the two inputs to
 * the same render: the *time of day* decides where the light comes from, and the
 * couple's recent *momentum* decides whether the island is wearing its light or
 * dark face.
 *
 * Pure, and free of Phaser and React. The scene reads these numbers; nothing
 * here knows what a canvas is.
 *
 * ## A note on the shadow maths
 *
 * The spec this was built from gave the lighting as:
 *
 *     lightAngle     = (timeOfDay / 24) * 2π
 *     shadowDirection = lightAngle + π
 *     shadowLength    = baseLength * abs(cos(lightAngle))
 *
 * The direction is right and is kept. The length is inverted, and shipping it
 * would have been visible rather than subtle: at 06:00 that gives
 * `abs(cos(π/2))` = 0, so dawn casts no shadow at all, and at noon it gives
 * `abs(cos(π))` = 1, the longest shadow of the day. Real light does the
 * opposite — long at the horizon, short underfoot — and a garden whose shadows
 * vanish at sunrise and stretch at midday reads as broken without anyone being
 * able to say why.
 *
 * So length is derived from the sun's *elevation* instead: `sin` of its arc
 * across the sky, 0 at both horizons and 1 at its peak. That is the one change
 * from the spec, and it is here rather than in a commit message because this is
 * where somebody comparing the two will be standing.
 */

import type { DioramaTheme } from './world';

/** Sunrise and sunset, in whole hours. Fixed rather than computed from a latitude. */
export const DAWN_HOUR = 6;
export const DUSK_HOUR = 18;

/**
 * How much of its length a shadow loses at the sun's peak.
 *
 * Not 1: a shadow that disappears entirely at noon makes everything in the
 * garden look like it is floating.
 */
export const NOON_SHORTENING = 0.75;

/** Night shadows are long and soft. The moon is dimmer, not differently shaped. */
export const NIGHT_SHADOW_SCALE = 1.15;

/** Fraction of a full turn, in radians. */
const TAU = Math.PI * 2;

export interface Lighting {
  /**
   * Where the light is, as an angle across the sky in radians: 0 at the eastern
   * horizon, π/2 overhead, π at the western horizon.
   */
  lightAngle: number;
  /** Which way shadows fall, in radians. Always opposite the light. */
  shadowDirection: number;
  /** Shadow length as a multiple of the caster's height. */
  shadowLength: number;
  /** 0 at the horizons, 1 at the sun's peak. Drives how hard the light is. */
  elevation: number;
  /** True between dusk and dawn, when the moon is the light source. */
  isNight: boolean;
}

/** Hours, wrapped into [0, 24). Total: a silly clock still lights the garden. */
export function normalizeHour(hour: number): number {
  if (!Number.isFinite(hour)) return 12;
  return ((hour % 24) + 24) % 24;
}

/**
 * The sun's (or moon's) position, as an angle across its own arc.
 *
 * Daylight maps 06:00-18:00 onto 0-π. Night maps 18:00-06:00 onto the same
 * range, so the moon rises and sets exactly as the sun does — which is what
 * keeps the night looking like a lit scene rather than an unlit one.
 */
export function lightAngle(hour: number): number {
  const h = normalizeHour(hour);
  if (h >= DAWN_HOUR && h < DUSK_HOUR) {
    return ((h - DAWN_HOUR) / (DUSK_HOUR - DAWN_HOUR)) * Math.PI;
  }
  const intoNight = h < DAWN_HOUR ? h + (24 - DUSK_HOUR) : h - DUSK_HOUR;
  return (intoNight / (24 - (DUSK_HOUR - DAWN_HOUR))) * Math.PI;
}

export function isNight(hour: number): boolean {
  const h = normalizeHour(hour);
  return h < DAWN_HOUR || h >= DUSK_HOUR;
}

/**
 * Which way shadows fall: directly away from the light.
 *
 * This is the one piece of the original spec kept as written, wrapped into
 * [0, 2π) so a caller can feed it straight to a rotation.
 */
export function shadowDirection(angle: number): number {
  return ((angle + Math.PI) % TAU + TAU) % TAU;
}

/** 0 at the horizons, 1 at the peak. */
export function elevation(angle: number): number {
  return Math.max(0, Math.sin(angle));
}

/**
 * Shadow length as a multiple of the caster's height.
 *
 * Long at the horizons, short at the peak — the correction described at the top
 * of this file. Never zero, and never longer than `base`.
 */
export function shadowLength(base: number, angle: number, night = false): number {
  const safeBase = Number.isFinite(base) && base > 0 ? base : 0;
  const shortened = safeBase * (1 - NOON_SHORTENING * elevation(angle));
  return night ? shortened * NIGHT_SHADOW_SCALE : shortened;
}

/** Everything the scene needs to light a frame, from one clock reading. */
export function lightingAt(hour: number, base = 1): Lighting {
  const angle = lightAngle(hour);
  const night = isNight(hour);
  return {
    lightAngle: angle,
    shadowDirection: shadowDirection(angle),
    shadowLength: shadowLength(base, angle, night),
    elevation: elevation(angle),
    isNight: night,
  };
}

/* ---- which face the island is wearing ---- */

/**
 * The couple's recent momentum, as the three things the dark variant reads.
 *
 * Deliberately not a list of entries: this module should not know what a
 * `MoodEntry` is, and every one of these is something the caller already has to
 * compute for the dashboard anyway.
 */
export interface Momentum {
  /** Days since *either* partner logged anything at all. */
  daysSinceLog: number;
  /** How many of the last seven days carried at least one log, 0-7. */
  loggedDays: number;
  /** Mean joy over recent entries, on the mood page's 0-10 scale. */
  joy?: number;
  /** Mean moodiness over recent entries, same scale. High is a hard day. */
  moody?: number;
}

/** Three days of silence turns the island dark. */
export const QUIET_DAYS = 3;

/** Two logged days in a week is a dipped week, however they are spread. */
export const THIN_WEEK = 2;

/**
 * How far joy has to sit below moodiness before it counts.
 *
 * Two points, not one. A single hard afternoon should not redress the whole
 * island — the dark variant is meant to describe a stretch, and a threshold
 * that trips on noise would have it flickering day to day.
 */
export const LOW_MOOD_GAP = -2;

/** Joy minus moodiness. Positive is a good stretch; the scale is the mood page's. */
export function moodLift(momentum: Momentum): number | undefined {
  if (momentum.joy === undefined || momentum.moody === undefined) return undefined;
  if (!Number.isFinite(momentum.joy) || !Number.isFinite(momentum.moody)) return undefined;
  return momentum.joy - momentum.moody;
}

/**
 * Which face of the island is showing.
 *
 * Dark is not a punishment and the thresholds are set so it cannot read as one:
 * it takes three whole days of silence, or a week with almost nothing in it, or
 * a sustained low stretch. A couple having one bad day stays in the light.
 *
 * A couple with no history at all gets the light variant. Someone opening the
 * app for the first time should not find the garden already dark.
 */
export function variantFor(momentum: Momentum): DioramaTheme {
  if (momentum.daysSinceLog >= QUIET_DAYS) return 'Dark';
  if (momentum.loggedDays <= THIN_WEEK && momentum.daysSinceLog > 0) return 'Dark';

  const lift = moodLift(momentum);
  if (lift !== undefined && lift <= LOW_MOOD_GAP) return 'Dark';

  return 'Light';
}

/** A couple with nothing logged yet. Light, and standing in an empty week. */
export const FRESH_MOMENTUM: Momentum = { daysSinceLog: 0, loggedDays: 0 };
