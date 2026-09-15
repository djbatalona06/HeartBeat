import { useCallback, useEffect, useRef, type ReactNode } from 'react';

/**
 * A scrim, a panel, and the four behaviours every one of them needs.
 *
 * ## Three implementations, one idea
 *
 * `MenuSheet`, `CommandMenu`, and the garden drawers each grew their own scrim,
 * their own Escape handler and their own click-out. `MenuSheet`'s header says
 * as much — "the scrim, the escape key and the click-out are `CommandMenu`'s,
 * because a second dialog behaving differently from the first is worse than
 * either" — which is exactly right, and is an argument for one implementation
 * rather than a careful copy.
 *
 * ## What it adds that none of them had
 *
 * A **focus trap**. Every existing sheet moves focus *into* the panel and then
 * lets Tab walk straight back out into the page behind the scrim — where the
 * links are still focusable, still clickable by keyboard, and completely
 * invisible under an overlay. That is the bug this component exists to fix, and
 * it is invisible to anyone using a mouse.
 *
 * And **focus restore on every close path**. `MenuSheet` restores focus on
 * Escape and nowhere else, so closing by clicking the scrim drops the keyboard
 * back at the top of the document.
 *
 * ## It renders no styling of its own
 *
 * Both class names are the caller's. The whole point of `MenuSheet` is that its
 * panel flips direction at 768px, and a component that imposed its own panel
 * would take that away — so this owns behaviour and the caller keeps the paint.
 */
export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** The accessible name of the dialog. */
  label: string;
  scrimClassName: string;
  panelClassName: string;
}

/** Everything focusable, in DOM order. */
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Sheet({
  open, onClose, children, label, scrimClassName, panelClassName,
}: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  /** Who had focus before this opened, so it can be given back. */
  const opener = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    onClose();
    // Restore on *every* path, not just Escape. Closing by scrim used to leave
    // a keyboard user at the top of the document with no idea where they were.
    opener.current?.focus();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement as HTMLElement | null;
    // The first focusable thing inside, so the panel is where the keyboard is.
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab') return;

      const items = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      // The trap. Without these two lines Tab walks out of the panel and into
      // the page underneath, which is covered by a scrim and cannot be seen.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <>
      {/* Not a button, and not focusable: it is inside the trap, so a Tab that
          reached it would be a Tab that escaped the panel. Screen readers get
          the dialog; this is the mouse's way out. */}
      <div className={scrimClassName} onClick={close} aria-hidden="true" />
      <div
        className={panelClassName}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </>
  );
}
