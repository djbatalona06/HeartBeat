import { useEffect, useRef } from 'react';

export interface CanvasLoop {
  /** Draw once and stop. Used in calm mode and for reduced-motion. */
  still?: boolean;
  fps?: number;
  setup?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
}

/**
 * Runs a backdrop's paint loop against a full-bleed canvas, resizing with the
 * window and pausing whenever the page is hidden — a backdrop that keeps
 * animating in a background tab is pure battery drain on a phone.
 */
export function useCanvasLoop(loop: CanvasLoop): React.RefObject<HTMLCanvasElement> {
  const ref = useRef<HTMLCanvasElement>(null);
  const saved = useRef(loop);
  saved.current = loop;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let stopped = false;
    let last = 0;
    const start = performance.now();

    function size(): void {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      saved.current.setup?.(ctx!, w, h);
      saved.current.draw(ctx!, w, h, (performance.now() - start) / 1000);
    }

    function frame(now: number): void {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      const minGap = 1000 / (saved.current.fps ?? 30);
      if (now - last < minGap) return;
      last = now;
      saved.current.draw(ctx!, window.innerWidth, window.innerHeight, (now - start) / 1000);
    }

    function onVisibility(): void {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!stopped && !saved.current.still && !raf) {
        raf = requestAnimationFrame(frame);
      }
    }

    size();
    window.addEventListener('resize', size);
    document.addEventListener('visibilitychange', onVisibility);
    if (!loop.still) raf = requestAnimationFrame(frame);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loop.still, loop.fps]);

  return ref;
}
