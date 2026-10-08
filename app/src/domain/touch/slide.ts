/**
 * Which way a screen slides when the tab bar changes it.
 *
 * The bar is a row, so the row decides: a tab to the right of where you are
 * pushes in from the right, one to the left pops in from the left, the way a
 * native tab bar with a paging container does. Anything the bar cannot place
 * (a sub-page, a redirect, the same tab twice) gets `null`, which means no
 * slide; the screen's own entrance in `27-motion.css` still plays.
 */
export type SlideDirection = 'forward' | 'back';

/** The tab a path belongs to: its own, or the one it is a page under. */
export function tabIndex(path: string, tabs: readonly string[]): number {
  const exact = tabs.indexOf(path);
  if (exact >= 0) return exact;
  return tabs.findIndex((tab) => tab !== '/' && path.startsWith(`${tab}/`));
}

export function slideDirection(from: string, to: string, tabs: readonly string[]): SlideDirection | null {
  const a = tabIndex(from, tabs);
  const b = tabIndex(to, tabs);
  if (a < 0 || b < 0 || a === b) return null;
  return b > a ? 'forward' : 'back';
}
