/**
 * What time it is, as the garden understands it.
 *
 * ## Why this is a module and not three `new Date().getHours()` calls
 *
 * It used to be exactly that: `EveGardenPage` read the clock three separate
 * times in one render, and `sunAt` lived as a private helper inside the gate's
 * backdrop component. That was survivable while the garden was one screen
 * somebody opened on purpose. It stops being survivable now that the garden is
 * the home screen's ground, for two reasons:
 *
 * 1. **Three reads of the clock are three answers.** Cross an hour boundary
 *    mid-render and the sun, the stars and the weather disagree about what time
 *    it is. Nobody would ever see it — until the one time they did, at 6:59.
 * 2. **Nothing ever re-read it.** `new Date()` at render time is a photograph.
 *    Leave the app open on the home screen through sunset and the sun stays
 *    where it was when the tab opened, which is the opposite of what a live
 *    scene is for.
 *
 * So the clock is read in one place, the sun's position is derived from it, and
 * a component asks this module when to look again.
 *
 * ## No animation frame, and no ticker
 *
 * The scene changes on the hour. A `requestAnimationFrame` loop — or even a
 * once-a-second interval — would wake the phone sixty times a second to
 * recompute a number that changes twenty-four times a day. `msUntilNextHour`
 * exists so a caller can sleep exactly as long as there is nothing to do, and
 * a foregrounding app re-reads on `visibilitychange` rather than trusting a
 * timer that a backgrounded tab was never guaranteed to run.
 */

/**
 * Sunrise and sunset, in local hours.
 *
 * Fixed rather than computed from a latitude: this is a mood, not an almanac,
 * and asking a couple for their coordinates to decide when to draw stars would
 * be a permission prompt in exchange for nothing they asked for.
 */
export const SUNRISE = 6;
export const SUNSET = 19;

export type Phase = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * Where the sun sits across the day, as a point in a 400-wide viewBox.
 *
 * Moved here from `gate/GateBackdrop.tsx`, where it was a component's private
 * helper that a second component had already reached across the tree to import.
 * Two backdrops and the phase below now read one definition, which is what
 * keeps `night` from meaning one thing to the stars and another to the copy.
 */
export function sunAt(hour: number): { x: number; y: number; night: boolean } {
  // Sunrise at the left edge, the last hour of light at the right, and below
  // the horizon either side of that. `SUNSET` is the hour the sun is already
  // gone, so the arc ends an hour earlier. Tied to real local time, which is
  // what makes opening the app at 2am look like 2am.
  const lastLight = SUNSET - 1;
  const t = Math.min(1, Math.max(0, (hour - SUNRISE) / (lastLight - SUNRISE)));
  return {
    x: 60 + t * 280,
    // A shallow arc: highest at noon, low at both ends.
    y: 120 - Math.sin(t * Math.PI) * 70,
    night: hour < SUNRISE || hour >= SUNSET,
  };
}

/**
 * The hour, named.
 *
 * The four names exist so the scene can have a *character* rather than only a
 * sun position — the veil over the ground is tuned per phase, and the copy has
 * somewhere to hang off later. They are derived from `SUNRISE`/`SUNSET` rather
 * than written out as their own numbers, so `phaseAt(h) === 'night'` and
 * `sunAt(h).night` cannot drift apart. `schedule.test.ts` asserts that for all
 * twenty-four hours, because a garden that draws stars while calling itself
 * daytime is precisely the kind of bug nobody files.
 */
export function phaseAt(hour: number): Phase {
  const h = Math.floor(hour);
  if (h < SUNRISE || h >= SUNSET) return 'night';
  // The first three hours of light and the last two are their own thing. Noon
  // is the long middle, which is correct: most of a day is just day.
  if (h < SUNRISE + 3) return 'dawn';
  if (h >= SUNSET - 2) return 'dusk';
  return 'day';
}

/**
 * How long until the scene has something new to say.
 *
 * Always in `[1, 3600000]`, never zero: a caller that reschedules itself from
 * this value cannot spin. Exactly on the hour it returns a full hour, which is
 * the case a `setTimeout(0)` loop would have burned a phone battery on.
 */
export function msUntilNextHour(now: Date): number {
  const elapsed = now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
  return 3_600_000 - elapsed;
}
