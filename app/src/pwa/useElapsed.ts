import { useCallback, useEffect, useRef, useState } from 'react';
import { elapsed, pause, resume, start, type Clock } from '../domain/study/clock';

/**
 * How long something has been on screen, not counting time the tab was hidden.
 *
 * Deliberately small. The rules (resume rather than restart, unbalanced events,
 * never backwards) are in `domain/study/clock.ts`. This file only connects them
 * to `visibilitychange` and a tick.
 *
 * The clock is kept in a ref rather than in state. It has to change on
 * `visibilitychange` without a render, and `read()` must return the value as
 * of this moment, not as of the last tick. State would give an answer that is
 * up to 200 ms old, and the scoring reads it.
 *
 * `resetKey` starts a new clock. `running` false stops the tick but not the
 * clock: once a question is answered the countdown is no longer shown.
 */
export function useElapsed(running: boolean, resetKey: unknown): { elapsed: number; read: () => number } {
  const clock = useRef<Clock>(start(Date.now()));
  // Tagged with the key it was read for. Without the tag, the first render of a
  // new question would still show the last question's time, and a question
  // that had just timed out would time out the next one too.
  const [shown, setShown] = useState({ key: resetKey, ms: 0 });

  const read = useCallback(() => elapsed(clock.current, Date.now()), []);

  useEffect(() => {
    clock.current = start(Date.now());
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      clock.current = pause(clock.current, Date.now());
    }
    setShown({ key: resetKey, ms: 0 });
  }, [resetKey]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => {
      const now = Date.now();
      clock.current = document.visibilityState === 'hidden'
        ? pause(clock.current, now)
        : resume(clock.current, now);
      setShown((was) => ({ key: was.key, ms: elapsed(clock.current, now) }));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    // A paused clock reads the same value on every tick, so ticking while hidden
    // is harmless. Browsers throttle hidden tabs anyway.
    const timer = setInterval(() => setShown({ key: resetKey, ms: elapsed(clock.current, Date.now()) }), 200);
    return () => clearInterval(timer);
  }, [running, resetKey]);

  return { elapsed: Object.is(shown.key, resetKey) ? shown.ms : 0, read };
}
