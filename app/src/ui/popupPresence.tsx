import { useEffect, useSyncExternalStore } from 'react';

/**
 * Which one-time popups are on screen right now, so a second one waits.
 *
 * Two screens that each decide for themselves when to appear will, sooner or
 * later, appear together — the daily award and the "keep your link safe" offer
 * did exactly that on a first launch. This is the smallest thing that stops it:
 * a popup renders `<PopupPresence />` while it is open, and one that would
 * otherwise stack asks `usePopupBusy()` and holds back until it is false.
 *
 * Deliberately a counter in module scope and not React state: the popups are
 * mounted in different parts of the tree and nothing above them all would
 * otherwise know. It is only ever read through `useSyncExternalStore`.
 */

let open = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Mark a popup as open; the returned function marks it closed. */
export function registerPopup(): () => void {
  open += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    open -= 1;
    emit();
  };
}

export function openPopupCount(): number {
  return open;
}

export function usePopupBusy(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => { listeners.delete(onChange); };
    },
    () => open > 0,
    () => false,
  );
}

/** Render this inside a popup for as long as it is open. Draws nothing. */
export function PopupPresence() {
  useEffect(() => registerPopup(), []);
  return null;
}
