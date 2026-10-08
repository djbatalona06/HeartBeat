/**
 * Pull to refresh, as numbers.
 *
 * The finger's travel is damped (a rubber band, not a 1:1 drag) so a long pull
 * does not drag the indicator off the bottom of the screen, and the refresh
 * only arms once the damped distance passes `PULL_ARM_PX`. Letting go before
 * that is a cancel, which is how the native one behaves.
 */
export const PULL_ARM_PX = 64;
export const PULL_MAX_PX = 96;

export type PullState = 'idle' | 'pulling' | 'armed';

/** Finger travel in px → how far the indicator moves. Never negative. */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0;
  // Square-root damping: quick at first, then heavier the further you go.
  return Math.min(PULL_MAX_PX, Math.sqrt(dy) * 6);
}

export function pullState(dy: number): PullState {
  const d = pullDistance(dy);
  if (d <= 0) return 'idle';
  return d >= PULL_ARM_PX ? 'armed' : 'pulling';
}
