/**
 * The number on the home-screen icon, where the platform has one.
 *
 * Feature-detected and forgiving: `setAppBadge` exists on installed PWAs in
 * Chromium and Safari, is absent in a plain tab, and can reject when the
 * permission it rides on (notifications, on iOS) has not been granted. None of
 * those is an error worth surfacing — the tab bar still shows the same dots.
 */
export const supportsAppBadge = (): boolean =>
  typeof navigator !== 'undefined' && 'setAppBadge' in navigator;

export function showAppBadge(count: number): void {
  if (!supportsAppBadge()) return;
  const nav = navigator as Navigator & {
    setAppBadge: (n?: number) => Promise<void>;
    clearAppBadge: () => Promise<void>;
  };
  (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()).catch(() => {});
}
