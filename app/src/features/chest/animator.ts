/**
 * The opening: shake, burst, then the items arrive one at a time.
 *
 * ## Why this is imperative and not a CSS class on a state machine
 *
 * Almost all motion in this app is a CSS keyframe switched on by a data
 * attribute, and that is right when the motion is a *state* — a card is
 * expanded, a leaf is fluttering, a chest's floor is live. An opening is not a
 * state, it is a **sequence with an end**: three phases that must run in order,
 * and something that has to happen once the last one has finished.
 *
 * Done with data attributes that means a chain of `setTimeout`s whose durations
 * are written twice — once in the stylesheet and once in the component — and
 * which drift the moment somebody edits one of them. `Animation.finished` is a
 * promise, so the sequence is `await`ed and the durations live in exactly one
 * place: `REVEAL_TIMING`, below.
 *
 * ## Nothing here is load-bearing
 *
 * `run()` resolves whether it animated or not. Under calm mode, under
 * `prefers-reduced-motion`, on an element that has no `animate` (jsdom, an
 * older engine, a page that was torn down mid-open), and after `cancel()`, it
 * puts every element in its **finished** state and returns. The reveal is
 * readable at every one of those, because the prizes are text and pictures in
 * the DOM and this only decides how they got there.
 */

/**
 * How long each phase takes, in milliseconds. The one copy of these numbers.
 *
 * Short on purpose. A chest is opened repeatedly — six times over on a bad run
 * — and an animation somebody has already seen is a toll rather than a
 * reward, so the whole thing is under a second and a half for three items and
 * a tap dismisses it at any point.
 */
export const REVEAL_TIMING = {
  /** The lid rattling before it gives. */
  shake: 520,
  /** The moment it gives. */
  burst: 260,
  /** One item arriving. */
  item: 340,
  /** From one item starting to the next starting. */
  stagger: 170,
} as const;

export interface RevealPlan {
  shake: number;
  burst: number;
  item: number;
  stagger: number;
  /** When each item starts, relative to the beginning of the reveal. */
  starts: number[];
  /** Start to the last item settled. Zero when nothing will move. */
  total: number;
}

/**
 * The timings for an opening of `count` items.
 *
 * Pure, and the reason the class below has nothing arithmetic left in it: the
 * thing worth a test here is when each item arrives, and that question should
 * not need a DOM to ask.
 *
 * `calm` collapses everything to zero rather than to something quick. Calm
 * mode and `prefers-reduced-motion` are a request for no motion, and a fast
 * animation is still an animation.
 */
export function revealPlan(count: number, calm = false): RevealPlan {
  const items = Math.max(0, Math.floor(count));
  if (calm || items === 0) {
    return { shake: 0, burst: 0, item: 0, stagger: 0, starts: [], total: 0 };
  }

  const { shake, burst, item, stagger } = REVEAL_TIMING;
  const opened = shake + burst;
  const starts = Array.from({ length: items }, (_, i) => opened + i * stagger);
  return {
    shake,
    burst,
    item,
    stagger,
    starts,
    total: starts[starts.length - 1] + item,
  };
}

/** The elements an opening moves. Any of them may be absent. */
export interface RevealParts {
  /** The chest itself, which shakes and then gives. */
  chest?: Element | null;
  /** The flash at the moment it opens. */
  burst?: Element | null;
  /** One per item, in the order they should arrive. */
  items: readonly (Element | null)[];
}

/** Whether this element can actually be animated here. */
function animatable(el: Element | null | undefined): el is Element {
  return Boolean(el) && typeof (el as Element).animate === 'function';
}

export class ChestAnimator {
  private readonly plan: RevealPlan;

  private running: Animation[] = [];

  private stopped = false;

  constructor(private readonly parts: RevealParts, calm = false) {
    this.plan = revealPlan(parts.items.length, calm);
  }

  /** What the reveal will cost in time. Zero means it will not move at all. */
  get duration(): number {
    return this.plan.total;
  }

  /**
   * Run the whole sequence, and resolve when the last item has settled.
   *
   * Never rejects. A cancelled animation rejects its `finished` promise with an
   * `AbortError`, and a caller awaiting a reveal that was dismissed does not
   * want an exception — it wants to know the reveal is over, which it is.
   */
  async run(): Promise<void> {
    if (this.plan.total === 0 || this.stopped) return;

    const { chest, burst, items } = this.parts;

    // The lid rattling. Rotation only, so it stays on the compositor.
    if (animatable(chest)) {
      this.track(chest.animate(
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-3.5deg)' },
          { transform: 'rotate(3deg)' },
          { transform: 'rotate(-2deg)' },
          { transform: 'rotate(0deg) scale(1.06)' },
        ],
        { duration: this.plan.shake, easing: 'ease-in-out' },
      ));
    }

    if (animatable(burst)) {
      this.track(burst.animate(
        [
          { transform: 'scale(0.2)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1, offset: 0.45 },
          { transform: 'scale(1.5)', opacity: 0 },
        ],
        { duration: this.plan.burst, delay: this.plan.shake, easing: 'ease-out', fill: 'backwards' },
      ));
    }

    items.forEach((item, i) => {
      if (!animatable(item)) return;
      this.track(item.animate(
        [
          { transform: 'translateY(14px) scale(0.86)', opacity: 0 },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ],
        {
          duration: this.plan.item,
          delay: this.plan.starts[i],
          easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
          // Held at both ends: without `backwards` an item is fully visible
          // for its whole delay and then jumps to the start of its own
          // entrance, which is the one thing a staggered reveal must not do.
          fill: 'both',
        },
      ));
    });

    const last = this.running[this.running.length - 1];
    if (!last) return;
    await last.finished.catch(() => {});
  }

  /**
   * Stop, and leave everything where the reveal would have ended.
   *
   * A dismissed reveal should not snap the items back to the invisible state
   * their entrance started from, which is what cancelling outright would do,
   * so each animation is finished rather than cancelled.
   */
  cancel(): void {
    this.stopped = true;
    for (const animation of this.running) {
      try {
        animation.finish();
      } catch {
        // An animation with an infinite duration cannot be finished. None of
        // these has one; this is here so a dismiss can never throw.
      }
    }
    this.running = [];
  }

  private track(animation: Animation): void {
    this.running.push(animation);
  }
}
