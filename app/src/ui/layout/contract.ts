/**
 * The rules a screen has to keep, as arithmetic.
 *
 * ## Why these are here and not in the components
 *
 * Vitest runs in `environment: 'node'` and its `include` is `*.test.ts` — never
 * `.tsx` — so a rule that lives inside a component is a rule with no test. This
 * repo already solved that once: `features/dashboard/layout.ts` is the ring
 * geometry pulled out of the page so the spacing could be asserted. Same move.
 *
 * ## The rule itself
 *
 * "At most three swipes per subpage" and "at most three viewport-heights of
 * scroll" are the same idea counted two ways: a screen you cannot reach the
 * bottom of is a screen where the last thing on it may as well not exist. The
 * numbers are a ceiling on how much one screen may ask of somebody holding a
 * phone in bed, which is the posture this app is actually used in.
 *
 * Both are **dev-time warnings, never thrown**. A page that trips one is too
 * long, which is a design problem to fix on purpose — not a reason to show a
 * crash screen to a couple who just wanted to log a walk.
 */

/**
 * The most panes one `SwipePane` may carry.
 *
 * Three, because the dot indicator has to be countable at a glance and because
 * a fourth pane is where people start swiping past the thing they wanted. It is
 * exported so the test and the component read the same number rather than
 * agreeing by coincidence.
 */
export const MAX_PANES = 3;

/** The most viewport-heights a single screen may scroll. */
export const MAX_VIEWPORTS = 3;

/** True when a pane count is over the ceiling. */
export function exceedsPaneLimit(count: number): boolean {
  return count > MAX_PANES;
}

/**
 * True when a screen is taller than the scroll ceiling.
 *
 * Guards a zero or negative viewport rather than dividing by it: a hidden tab,
 * a `ResizeObserver` firing before layout, and jsdom all report 0, and
 * `anything / 0` is `Infinity`, which would warn on every screen in the app the
 * first time one of those happened.
 */
export function exceedsScrollLimit(scrollHeight: number, viewportHeight: number): boolean {
  if (!(viewportHeight > 0)) return false;
  return scrollHeight / viewportHeight > MAX_VIEWPORTS;
}

/**
 * Keep a pane index inside the panes that exist.
 *
 * Clamps rather than wraps. Wrapping would mean a right-swipe on the last pane
 * landing on the first, which reads as the screen having jumped — and with
 * three panes there is never enough distance for that to feel like a carousel
 * rather than a glitch.
 *
 * An empty pager answers 0 rather than -1, so a caller indexing an empty array
 * gets `undefined` instead of the last element.
 */
export function clampPaneIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), count - 1));
}

/**
 * Where an arrow key should land.
 *
 * Separate from `clampPaneIndex` because the question is different — this one
 * knows about direction and is what `SwipePane`'s `onKeyDown` calls, so the
 * keyboard path is tested even though the component is not.
 */
export function paneAfterKey(key: string, index: number, count: number): number {
  const delta = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  if (delta === 0) return clampPaneIndex(index, count);
  return clampPaneIndex(index + delta, count);
}

/**
 * The dev-only complaint, as a string or null.
 *
 * Returns the message rather than calling `console.warn` so the wording is
 * testable and so the component decides when to say it. Null means the screen
 * is within its budget.
 */
export function overBudgetWarning(
  name: string,
  { panes, scrollHeight, viewportHeight }: {
    panes?: number;
    scrollHeight?: number;
    viewportHeight?: number;
  },
): string | null {
  if (panes !== undefined && exceedsPaneLimit(panes)) {
    return `${name} has ${panes} panes; the ceiling is ${MAX_PANES}. Split it into two screens rather than adding a fourth swipe.`;
  }
  if (
    scrollHeight !== undefined
    && viewportHeight !== undefined
    && exceedsScrollLimit(scrollHeight, viewportHeight)
  ) {
    const tall = (scrollHeight / viewportHeight).toFixed(1);
    return `${name} is ${tall} viewports tall; the ceiling is ${MAX_VIEWPORTS}. Something near the bottom is not being read.`;
  }
  return null;
}
