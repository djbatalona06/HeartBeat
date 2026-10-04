import { useEffect, useState, type ComponentType } from 'react';

/**
 * A gear item's drawing, loaded after the app rather than with it.
 *
 * The forty drawings were about a fifth of the precache's headroom and are only
 * ever shown as small icons -- the Bag, Home's equipped strip, the Merchant, the
 * onboarding reveal -- always for an id the caller already holds. So they do
 * not ride in the first download. They arrive as one lazy chunk, are cached by
 * the service worker the first time (and warmed at idle, `useWarmGearArt`), and
 * until then every icon is a quiet outlined square of the same size, so
 * nothing shifts when the art lands.
 *
 * Once the registry has loaded it is held in a module variable, so every later
 * render is synchronous.
 *
 * **The only door.** Anything that imports `art/gear` at runtime pulls the whole
 * registry back into the entry chunk, silently, and the precache ceiling is the
 * first place anybody would hear about it. `gearArt.test.ts` walks `src/` for
 * that.
 */

type Lookup = (itemId: string) => ComponentType | undefined;

let lookup: Lookup | undefined;
let loading: Promise<Lookup> | undefined;

/** Start (or join) the one load. A failed load is forgotten so the next call retries. */
export function loadGearArt(): Promise<Lookup> {
  loading ??= import('./gear-art')
    .then((module) => (lookup = module.gearArt))
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

/** Fetch the chunk when the browser is idle, so the service worker caches it for offline use. */
export function useWarmGearArt(): void {
  useEffect(() => {
    const warm = () => { void loadGearArt().catch(() => {}); };
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(warm, { timeout: 5000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(warm, 2000);
    return () => clearTimeout(timer);
  }, []);
}

export function GearIcon({ id }: { id: string }) {
  const [ready, setReady] = useState<Lookup | undefined>(lookup);

  useEffect(() => {
    if (ready) return undefined;
    let live = true;
    loadGearArt()
      .then((found) => { if (live) setReady(() => found); })
      .catch(() => {});
    return () => { live = false; };
  }, [ready]);

  if (!ready) {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art gear-art-pending">
        <rect x="18" y="18" width="64" height="64" rx="14" fill="none" stroke="var(--color-text-muted)" strokeWidth="3" opacity="0.4" />
      </svg>
    );
  }
  const Art = ready(id);
  return Art ? <Art /> : null;
}
