import { useEffect } from 'react';
import { sync } from './sync';

/**
 * Runs sync on the occasions that matter and no others.
 *
 * Not on an interval: the day log is not a conversation, and a phone in a
 * pocket has nothing to say. The moments a round trip is actually worth making
 * are when the app comes back to the foreground, when the network returns, and
 * once on launch — which together cover every way the other phone's changes
 * become interesting.
 */
export function useSync(): void {
  useEffect(() => {
    let cancelled = false;
    let running = false;

    const run = async () => {
      // Overlapping rounds would push the same rows twice and race on the
      // watermark, which is how a sync loop starts.
      if (running || cancelled) return;
      running = true;
      try {
        // A page of history means there is more waiting; drain it rather than
        // leaving a device that has been off for a month permanently behind.
        for (let page = 0; page < 20; page++) {
          const result = await sync();
          if (!result || !result.more || cancelled) break;
        }
      } catch {
        // Offline, or the backend is down. Both are ordinary: everything renders
        // from IndexedDB, and the next foreground will try again.
      } finally {
        running = false;
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void run(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', run);
    void run();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', run);
    };
  }, []);
}
