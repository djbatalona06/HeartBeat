import { flushSync } from 'react-dom';
import type { SlideDirection } from '../domain/touch/slide';

/**
 * Change screens inside a View Transition, sliding the way `dir` says.
 *
 * Returns `false`, having done nothing, wherever the slide should not happen:
 * calm mode or reduced motion, a browser without the API (Safari before 18,
 * Firefox), or a move the tab bar cannot place. The caller then lets the link
 * navigate as it always did, and the screen's own CSS entrance plays instead.
 *
 * `flushSync` is what makes this work with HashRouter: the API snapshots the
 * old screen, runs the callback, and snapshots again, so the new route has to
 * be in the DOM by the time the callback returns rather than on React's next
 * tick. The direction rides on `<html data-slide>`, which the
 * `::view-transition-*` rules in `styles/features/native.css` read.
 */
export function slideTo(go: () => void, dir: SlideDirection | null, calm: boolean): boolean {
  if (calm || !dir || typeof document.startViewTransition !== 'function') return false;
  const root = document.documentElement;
  root.dataset.slide = dir;
  const transition = document.startViewTransition(() => flushSync(go));
  void transition.finished.finally(() => { delete root.dataset.slide; });
  return true;
}
