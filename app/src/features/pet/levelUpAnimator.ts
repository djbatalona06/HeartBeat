/**
 * The pet going up a level: a hop, a glow, and the bar sweeping back.
 *
 * Imperative for the reasons `features/chest/animator.ts` gives in its header —
 * this is a sequence with an end, and Home needs to know when it has ended so
 * the daily greeting's pose can follow it rather than fight it for the same
 * `transform`. Same contract as the chest: `run()` never rejects, `cancel()`
 * finishes rather than snaps back, and calm means no motion at all.
 */

/** The one copy of these numbers. */
export const LEVEL_UP_TIMING = {
  small: { hops: 1, hop: 420, glow: 520, fill: 360 },
  /** A level that opens a garden plot. Seen at most seven times, ever. */
  big: { hops: 2, hop: 420, glow: 1000, fill: 520 },
} as const;

export interface LevelUpPlan {
  hops: number;
  hop: number;
  glow: number;
  fill: number;
  /** Start to the last thing settled. Zero when nothing will move. */
  total: number;
}

/** Everything starts together; the longest part decides the length. */
export function levelUpPlan({ calm, big }: { calm: boolean; big: boolean }): LevelUpPlan {
  if (calm) return { hops: 0, hop: 0, glow: 0, fill: 0, total: 0 };
  const { hops, hop, glow, fill } = LEVEL_UP_TIMING[big ? 'big' : 'small'];
  return { hops, hop, glow, fill, total: Math.max(hops * hop, glow, fill) };
}

export interface LevelUpParts {
  /** `.home-mascot-standalone`: it hops and glows. */
  mascot?: Element | null;
  /** `.home-pet-fill`: it sweeps from full back to where the new level starts. */
  fill?: Element | null;
}

function animatable(el: Element | null | undefined): el is Element {
  return Boolean(el) && typeof (el as Element).animate === 'function';
}

export class LevelUpAnimator {
  private running: Animation[] = [];

  private stopped = false;

  constructor(private readonly parts: LevelUpParts, private readonly plan: LevelUpPlan) {}

  get duration(): number {
    return this.plan.total;
  }

  /** Resolves when the longest part has settled. Never rejects. */
  async run(): Promise<void> {
    if (this.plan.total === 0 || this.stopped) return;
    const { mascot, fill } = this.parts;

    if (animatable(mascot)) {
      // Squash, leap, land. Transform only, so it stays on the compositor.
      this.running.push(mascot.animate(
        [
          { transform: 'translateY(0) scale(1, 1)' },
          { transform: 'translateY(0) scale(1.08, 0.9)', offset: 0.18 },
          { transform: 'translateY(-14%) scale(0.95, 1.06)', offset: 0.5 },
          { transform: 'translateY(0) scale(1.04, 0.96)', offset: 0.82 },
          { transform: 'translateY(0) scale(1, 1)' },
        ],
        { duration: this.plan.hop, iterations: this.plan.hops, easing: 'ease-in-out' },
      ));
      // The glow is a filter on the element itself: the soft light behind the
      // pet is a pseudo-element, and `animate()` cannot reach one.
      this.running.push(mascot.animate(
        [
          { filter: 'drop-shadow(0 0 0 transparent)' },
          { filter: 'drop-shadow(0 0 18px var(--color-accent))', offset: 0.4 },
          { filter: 'drop-shadow(0 0 0 transparent)' },
        ],
        { duration: this.plan.glow, easing: 'ease-out' },
      ));
    }

    if (animatable(fill)) {
      // One keyframe: from full, to wherever the new level's bar already is.
      this.running.push(fill.animate(
        [{ width: '100%' }],
        { duration: this.plan.fill, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      ));
    }

    await Promise.all(this.running.map((a) => a.finished.catch(() => {})));
  }

  /** Stop, and leave everything where it would have ended. */
  cancel(): void {
    this.stopped = true;
    for (const animation of this.running) {
      try {
        animation.finish();
      } catch {
        // Nothing here is infinite; this only keeps a dismiss from throwing.
      }
    }
    this.running = [];
  }
}
