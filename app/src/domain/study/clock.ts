/**
 * A stopwatch that can be put down.
 *
 * The quiz gives each question a fixed time. It used to measure that as
 * `Date.now() - askedAt`, which kept counting while the phone was in a pocket:
 * a phone call mid-question came back to a question already timed out, and the
 * speed score charged the call to the answer.
 *
 * So a question's time is this clock, and the page pauses it when the tab is
 * hidden. The decisions worth pinning live here, where vitest can reach them:
 *
 *  - **A paused question resumes; it never restarts.** Restarting would let
 *    anyone farm the speed bonus by backgrounding the app before answering.
 *  - **The pause is not capped.** A long call is still a call.
 *  - **Events arrive unbalanced.** Browsers can send `hidden` twice or
 *    `visible` without a `hidden` before it, so pausing a paused clock and
 *    resuming a running one both do nothing.
 *
 * Every function returns a new value; a clock is never changed in place.
 */

export interface Clock {
  readonly startedAt: number;
  /** When it was put down, or null while it runs. */
  readonly pausedAt: number | null;
  /** Time spent put down, from pauses already resumed. */
  readonly pausedMs: number;
}

export function start(now: number): Clock {
  return { startedAt: now, pausedAt: null, pausedMs: 0 };
}

export function pause(clock: Clock, now: number): Clock {
  if (clock.pausedAt !== null) return clock;
  return { ...clock, pausedAt: now };
}

export function resume(clock: Clock, now: number): Clock {
  if (clock.pausedAt === null) return clock;
  // `max` so a wall clock stepping backwards while paused cannot make a pause
  // count negative and hand time back.
  return { ...clock, pausedAt: null, pausedMs: clock.pausedMs + Math.max(0, now - clock.pausedAt) };
}

/** Time the clock has run. Frozen while paused, never negative. */
export function elapsed(clock: Clock, now: number): number {
  const until = clock.pausedAt ?? now;
  return Math.max(0, until - clock.startedAt - clock.pausedMs);
}
