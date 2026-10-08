import { useEffect } from 'react';

/**
 * Keeps the screen on while `active`, where the browser allows it.
 *
 * For the screens you watch rather than touch — a breathing pattern, a running
 * timer — where the phone dimming and locking mid-exercise is the interruption.
 * The browser drops the lock whenever the app is hidden, so it is asked for
 * again on every return while still active. Unsupported (Safari before 16.4)
 * or refused (low battery) is silence: the screen simply sleeps as it did.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then((next) => {
        if (live) lock = next;
        else void next.release();
      }).catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
