import { useRef, type ReactNode } from 'react';
import { useFocusTrap } from './useFocusTrap';
import { useDragToDismiss } from './useDragToDismiss';

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
 *
 * ## Drag to dismiss, for the ones that rise from the bottom
 *
 * `draggable` adds a grabber and lets a finger pull the panel down to close it
 * (`useDragToDismiss`). Opt-in, because a centred popup has no edge to be
 * pulled towards. It closes through the same path as the scrim, so focus is
 * restored the same way.
 */
export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** The accessible name of the dialog. */
  label: string;
  scrimClassName: string;
  panelClassName: string;
  /** A bottom sheet: show a grabber and close on a downward drag. */
  draggable?: boolean;
}

export function Sheet({
  open, onClose, children, label, scrimClassName, panelClassName, draggable = false,
}: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useFocusTrap(panel, open, { onEscape: onClose });

  // Restored on every close path, not just Escape: closing by scrim used to
  // leave a keyboard user at the top of the document with no idea where they were.
  const closeByScrim = () => {
    onClose();
    restoreFocus();
  };
  useDragToDismiss(panel, open && draggable, closeByScrim);

  if (!open) return null;

  return (
    <>
      {/* Not a button, and not focusable: it is inside the trap, so a Tab that
          reached it would be a Tab that escaped the panel. Screen readers get
          the dialog; this is the mouse's way out. */}
      <div className={scrimClassName} onClick={closeByScrim} aria-hidden="true" />
      <div
        className={panelClassName}
        ref={panel}
        // react-doctor-disable-next-line prefer-html-dialog -- this is the focus trap: the hook gives what <dialog> gives without replacing the callers' panel and scrim classes
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {draggable ? <span className="sheet-grabber" aria-hidden="true" /> : null}
        {children}
      </div>
    </>
  );
}
