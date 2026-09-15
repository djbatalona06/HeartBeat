import { useEffect, useState } from 'react';
import { msUntilNextHour, phaseAt, type Phase } from '../../domain/scene/schedule';

/**
 * The current hour, kept current, without a ticker.
 *
 * ## Three ways the clock moves, and only one of them is a timer
 *
 * 1. **Mount.** Read it once, straight away.
 * 2. **The hour turning.** One `setTimeout` sized by `msUntilNextHour`, which
 *    re-arms itself. Not an interval: an interval drifts, and one that fires
 *    every hour drifts visibly by the end of a day left open.
 * 3. **Coming back.** `visibilitychange`, because a backgrounded tab is under
 *    no obligation to run that timeout at all — phones throttle and suspend
 *    them freely. Without this, reopening the app after a night asleep shows
 *    yesterday afternoon's sun until the next hour turns.
 *
 * The third is the one that matters most in a PWA and the one a naive
 * implementation leaves out, because on a desktop browser with the tab in front
 * the timer alone looks like it works.
 *
 * No `requestAnimationFrame` anywhere: the scene has twenty-four distinct
 * states in a day, and waking a phone sixty times a second to recompute one of
 * them is how an ambient background becomes a battery complaint.
 */
export function useHour(): { hour: number; phase: Phase } {
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const sync = () => {
      const now = new Date();
      // `setHour` with the same number is a no-op in React, so the wake-ups
      // that land inside the hour they were scheduled for cost one comparison
      // and no render.
      setHour(now.getHours());
      timer = setTimeout(sync, msUntilNextHour(now));
    };

    sync();

    // Only on the way back in. Re-arming on the way out would schedule work for
    // a tab that is about to stop being allowed to do any.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        sync();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { hour, phase: phaseAt(hour) };
}
