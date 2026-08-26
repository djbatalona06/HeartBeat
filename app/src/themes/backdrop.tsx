import type { CSSProperties } from 'react';
import { useCanvasLoop, type CanvasLoop } from './useCanvasLoop';

const STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 0,
  pointerEvents: 'none',
};

/**
 * Every pack's backdrop is the same canvas element with a different paint
 * function, so the packs only have to describe how they look.
 */
export function Backdrop(loop: CanvasLoop) {
  const ref = useCanvasLoop(loop);
  return <canvas ref={ref} style={STYLE} aria-hidden="true" />;
}
