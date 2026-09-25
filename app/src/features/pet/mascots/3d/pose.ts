import type { MascotMood } from '../roster';

/**
 * Everything the idle loop moves, as plain numbers.
 *
 * Kept free of three.js on purpose: it is the one part of the 3D mascots with
 * rules in it (how fast each mood breathes, when an eye blinks, what calm
 * leaves standing), and rules are what this repo tests without a renderer.
 */
export interface Pose {
  /** Lift of the whole figure, in model units (the frame is 2 units tall). */
  bob: number;
  /** 0 at rest, 1 at the top of a breath. */
  breath: number;
  /** Turn about the vertical axis, radians, on top of the resting view. */
  yaw: number;
  /** Head roll, radians. */
  tilt: number;
  /** Head nod, radians. Positive tips the face down. */
  nod: number;
  /** Swing for tails, ears and ribbons, radians before each part's own gain. */
  sway: number;
  /** 0 open, 1 shut. Only the open-eyed face has anything to shut. */
  blink: number;
}

/** A three-quarter view: enough turn to read as a body, not enough to lose an eye. */
export const REST_YAW = -0.24;

interface Tempo {
  /** Seconds per breath. `content` and `sleepy` match the SVG's 5.5 s and 8.5 s. */
  period: number;
  bob: number;
  tilt: number;
  sway: number;
  look: number;
  /** How far the head hangs, radians. Only sleep hangs it. */
  droop: number;
}

/** Typed on `MascotMood`, so a fourth mood fails the build until it has a tempo. */
const TEMPO: Record<MascotMood, Tempo> = {
  happy: { period: 1.5, bob: 0.05, tilt: 0.08, sway: 0.3, look: 0.14, droop: 0 },
  content: { period: 5.5, bob: 0.02, tilt: 0.04, sway: 0.14, look: 0.1, droop: 0 },
  sleepy: { period: 8.5, bob: 0.012, tilt: 0.02, sway: 0.05, look: 0.02, droop: 0.16 },
};

export const BLINK_EVERY = 4.3;
export const BLINK_FOR = 0.16;

/**
 * Where the figure stands at `t` seconds.
 *
 * `calm` is the app's own switch (calm mode or reduced motion, folded together
 * by `ThemeProvider`) and it does not slow the loop down, it ends it: the pose
 * is the same for every `t`, so the engine can draw once and stop asking.
 * Sleep still hangs the head, because that is the drawing, not the motion.
 */
export function pose(mood: MascotMood, t: number, calm: boolean): Pose {
  const m = TEMPO[mood];
  if (calm) return { bob: 0, breath: 0, yaw: 0, tilt: 0, nod: m.droop, sway: 0, blink: 0 };

  const phase = (t / m.period) * Math.PI * 2;
  const breath = 0.5 - 0.5 * Math.cos(phase);
  return {
    // Happy hops — the bounce touches down rather than floating — and the
    // other two only rise with the breath.
    bob: mood === 'happy' ? m.bob * Math.abs(Math.sin(phase)) : m.bob * breath,
    breath,
    yaw: m.look * Math.sin(t * 0.37),
    tilt: m.tilt * Math.sin(phase * 0.5),
    nod: m.droop + m.droop * 0.3 * Math.sin(phase),
    sway: m.sway * Math.sin(phase * 1.3),
    blink: blinkAt(t),
  };
}

/** A quick lid, eased both ways, once every `BLINK_EVERY` seconds. */
export function blinkAt(t: number): number {
  const into = ((t % BLINK_EVERY) + BLINK_EVERY) % BLINK_EVERY;
  return into < BLINK_FOR ? Math.sin((Math.PI * into) / BLINK_FOR) : 0;
}
