import { useEffect } from 'react';
import { sync } from './sync';
import { syncHoldings } from './holdingsSync';
import { flushPetXp } from './petSync';
import { loadSettings } from '../db/database';
import { settleLifeEvents } from '../db/repository';

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
        // The shared pet rides the same occasions but not the same endpoint:
        // its XP is additive, so it is queued and summed server-side rather
        // than pushed as a row. Not awaited, and off the entry sync's failure
        // path: a pet flush that cannot reach the network hangs for as long as
        // fetch lets it, and the day log must not wait behind it.
        void flushPetXp().catch(() => {});
        // A page of history means there is more waiting; drain it rather than
        // leaving a device that has been off for a month permanently behind.
        for (let page = 0; page < 20; page++) {
          const result = await sync();
          if (!result || !result.more || cancelled) break;
        }

        // The RPG layer, on its own endpoint and its own watermarks — see
        // holdingsSync.ts for why it is not more kinds on /api/entries.
        //
        // After the entries, and inside the same try, but deliberately last:
        // the day log is what the app is for, and if only one of the two can
        // get through on a bad connection it should be that one. A throw here
        // is caught by the same handler and leaves both sets of watermarks
        // where they were.
        for (let page = 0; page < 20; page++) {
          const result = await syncHoldings();
          if (!result || !result.more || cancelled) break;
        }

        // A Good Vibe is written on the sender's phone and paid on ours, so the
        // grant only lands once the row has actually arrived — which is why
        // this is after the holdings loop and not beside the write.
        const settings = await loadSettings();
        if (settings.memberId && settings.coupleId && !cancelled) {
          await settleLifeEvents(settings.memberId, settings.coupleId);
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
