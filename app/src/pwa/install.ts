/**
 * iOS only permits Web Push for a web app launched from the Home Screen, so the
 * app has to be able to tell whether it is installed and say so plainly.
 */

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(iosStandalone) || window.matchMedia('(display-mode: standalone)').matches;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS reports itself as a Mac; touch points are what give it away.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export type InstallState = 'installed' | 'needs-install' | 'unsupported-browser';

export function installState(): InstallState {
  if (isStandalone()) return 'installed';
  if (isIos() && !/Safari/.test(navigator.userAgent)) return 'unsupported-browser';
  return 'needs-install';
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
