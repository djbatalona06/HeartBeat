/**
 * Where the pointer is, for backdrops that react to it.
 *
 * The backdrop canvas is pointer-events: none — it has to be, or it would eat
 * every tap meant for the app — so it cannot listen for itself. One window
 * listener shared by every pack is also cheaper than one per backdrop, and the
 * value is read during paint rather than pushed into React state: a pointermove
 * that re-rendered the tree sixty times a second would cost far more than the
 * effect is worth.
 */

export const pointer = { x: 0, y: 0, active: false };

if (typeof window !== 'undefined') {
  const move = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  };
  // Passive: this never calls preventDefault, and saying so keeps scrolling
  // off the main thread on touch.
  window.addEventListener('pointermove', move, { passive: true });
  // A finger that has lifted is not hovering anything, so stop pushing.
  window.addEventListener('pointerleave', () => { pointer.active = false; });
  window.addEventListener('pointercancel', () => { pointer.active = false; });
  window.addEventListener('pointerup', () => { pointer.active = false; });
}
