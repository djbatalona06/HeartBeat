import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** Everything focusable, in DOM order. */
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

interface Options {
  /** Runs on Escape, after which focus goes back to the opener. Omit for an overlay that should not close that way. */
  onEscape?: () => void;
  /** Move focus to the first focusable child on open. Off when the caller has its own target. */
  focusFirst?: boolean;
}

/**
 * The keyboard half of a modal: focus goes in, Tab cannot walk back out into a
 * page hidden behind the scrim, and focus is handed back to whoever opened it
 * on every way of closing.
 *
 * Returns `restoreFocus` for close paths the hook cannot see, such as a click on
 * the scrim.
 */
export function useFocusTrap(
  panel: RefObject<HTMLElement | null>,
  active: boolean,
  { onEscape, focusFirst = true }: Options = {},
): () => void {
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });

  /** Who had focus before this opened, so it can be given back. */
  const opener = useRef<HTMLElement | null>(null);
  const restoreFocus = useCallback(() => opener.current?.focus?.(), []);

  useEffect(() => {
    if (!active) return undefined;
    opener.current = document.activeElement as HTMLElement | null;
    if (focusFirst) panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (escape.current) {
          escape.current();
          opener.current?.focus?.();
        }
        return;
      }
      if (event.key !== 'Tab') return;

      const items = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      // Without these two branches Tab walks out of the panel and into the page
      // underneath, which is covered by a scrim and cannot be seen.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener.current?.focus?.();
    };
  }, [active, focusFirst, panel]);

  return restoreFocus;
}
