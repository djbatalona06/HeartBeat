import { useEffect, useRef, type RefObject } from 'react';
import { sheetOffset, shouldDismissSheet } from '../domain/touch/sheet';

/**
 * Pull a bottom sheet down to close it, the most iOS of gestures.
 *
 * Touch events rather than pointer events, and native listeners rather than
 * React's: the panel scrolls, so it cannot be `touch-action: none`, and the
 * only way to take a downward drag away from the scroller is a non-passive
 * `touchmove` that calls `preventDefault` — which React's synthetic handler
 * cannot do. A mouse never starts a drag; desktop keeps the scrim and Escape.
 *
 * A drag only starts from the grabber, or from the body when it is already
 * scrolled to the top, so reading a long sheet never closes it by accident.
 * It moves the panel with `translate`, not `transform`, so whatever transform
 * a panel's own CSS sets (a centring, an entrance) is composed with it rather
 * than replaced. Whether to close is `domain/touch/sheet.ts`.
 */
export function useDragToDismiss(
  panel: RefObject<HTMLElement | null>,
  enabled: boolean,
  onDismiss: () => void,
): void {
  // Read through a ref so the listeners are bound once per open, not once per
  // render of whatever owns the sheet.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    const el = panel.current;
    if (!enabled || !el) return undefined;

    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let eligible = false;
    let dragging = false;

    const onStart = (e: TouchEvent) => {
      dragging = false;
      eligible = e.touches.length === 1
        && (el.scrollTop <= 0 || (e.target as Element | null)?.closest('.sheet-grabber') != null);
      if (!eligible) return;
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      velocity = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!eligible) return;
      const y = e.touches[0].clientY;
      const dy = y - startY;
      if (!dragging) {
        // A few pixels of slop, so a tap is a tap. Upward first means scroll.
        if (dy < -4) eligible = false;
        if (dy <= 4) return;
        dragging = true;
        el.style.transition = 'none';
      }
      e.preventDefault();
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (y - lastY) / dt;
      lastY = y;
      lastT = e.timeStamp;
      el.style.translate = `0 ${sheetOffset(dy)}px`;
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      if (shouldDismissSheet(lastY - startY, velocity, el.offsetHeight)) {
        dismiss.current();
        return;
      }
      el.style.transition = 'translate var(--motion-fast) var(--ease-ios)';
      el.style.translate = '';
      el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.style.translate = '';
      el.style.transition = '';
    };
  }, [panel, enabled]);
}
