import { useEffect, useRef, useState } from 'react';

/**
 * Seconds since start, read off the clock rather than counted up.
 *
 * Every timed screen here uses this — breathing, movements, the timer itself.
 * The reason is the same in all three: a counter that adds a tick per frame
 * drifts when a frame is late, and stops entirely when the tab is backgrounded,
 * so a five-minute timer run with the phone in a pocket finishes late by
 * however long the screen was off. Reading `performance.now()` against a fixed
 * start cannot do that — pausing, backgrounding and a slow frame all resolve to
 * the same answer as if none of it had happened.
 */
export function useElapsed(running: boolean): [number, () => void] {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    if (!running) return;
    // Resume from where it paused rather than from zero.
    startedAt.current = performance.now() - elapsed * 1000;
    const tick = () => {
      setElapsed((performance.now() - startedAt.current) / 1000);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // `elapsed` is what this writes; listing it would restart the loop every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return [elapsed, () => setElapsed(0)];
}

/** mm:ss, for anything showing a duration. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
