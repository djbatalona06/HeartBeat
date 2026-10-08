/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { notificationTarget } from '../domain/notify/target';
import { HEAVY_CACHE, HEAVY_MAX_AGE_SECONDS, HEAVY_MAX_ENTRIES, isHeavyAsset } from './heavyAssets';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Headline faces, cache-first on first use.
 *
 * They are kept out of the precache (see `globIgnores` in vite.config.ts) —
 * five packs' worth of fonts would push every install past the budget in
 * tools/lighthouse.mjs for faces most couples never switch to. A browser only
 * requests the active pack's face, so this caches exactly the fonts somebody
 * has seen. The file names never change content, so a hit never goes stale;
 * bump the cache name if one ever does.
 */
const DISPLAY_FONTS = 'display-fonts-v1';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.includes('/fonts/display/')) return;
  event.respondWith(
    caches.open(DISPLAY_FONTS).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }),
  );
});

/**
 * The gear drawings, cache-first on first use.
 *
 * The chunk is kept out of the precache (`globIgnores` in vite.config.ts) and
 * `GearIcon` fetches it at idle, so it lands here during the first online
 * session. Its name carries a content hash, so a hit is never stale. A new
 * deploy has a new name; the old entries are deleted when the new one is
 * stored, or every release would leave one behind.
 */
const GEAR_ART = 'gear-art-v1';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !/\/assets\/gear-art-[^/]+\.js$/.test(url.pathname)) return;
  event.respondWith(
    caches.open(GEAR_ART).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok) {
        for (const stale of await cache.keys()) {
          if (stale.url !== event.request.url) await cache.delete(stale);
        }
        await cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});

/**
 * Phaser, the game worker, the 3D mascots and the .NET runtime, cache-first
 * once fetched. See `heavyAssets.ts` for why they are not precached and why
 * the matcher leaves the two routes above alone.
 *
 * Every name carries a content hash, so a hit is never stale. Old deploys'
 * files are not deleted on sight as the gear art's are: fifteen files can
 * change independently, so they age out by count and by date instead, and a
 * full disk gives the space back rather than failing the write.
 */
registerRoute(
  ({ url }) => isHeavyAsset(url, self.registration.scope),
  new CacheFirst({
    cacheName: HEAVY_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: HEAVY_MAX_ENTRIES,
        maxAgeSeconds: HEAVY_MAX_AGE_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

interface PushBody {
  title?: string;
  body?: string;
  path?: string;
  /** Notifications sharing a tag replace rather than stack. */
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushBody = {};
  try {
    data = event.data ? (event.data.json() as PushBody) : {};
  } catch {
    data = { body: event.data?.text() };
  }

  // `renotify` is in the Notifications spec but absent from lib.dom, so the
  // options object is widened rather than dropping the field. Without it a
  // repeated nudge replaces the old one silently and the phone never buzzes.
  const options: NotificationOptions & { renotify?: boolean } = {
    body: data.body ?? '',
    tag: data.tag ?? 'heartbeat',
    renotify: Boolean(data.tag),
    icon: 'icons/icon-192.png',
    // Android draws the badge as a silhouette from its alpha, so a full-colour
    // square icon became a white square. This one is the heart alone. iOS
    // ignores the field and uses the app icon.
    badge: 'icons/badge-96.png',
    data: { path: data.path ?? '/' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'HeartBeat', options).then(updateBadge),
  );
});

/**
 * The number on the home-screen icon, from here, while the app is closed.
 *
 * The open app sets it from its own badges (`useAppBadge`), but nothing ran
 * once it was closed, so the number stayed at whatever it was when the app
 * last went to the background. The worker cannot see those badges, so it
 * counts what it can see — the notifications still sitting in the tray — and
 * the app corrects it the moment it opens. Swallowed if the API is missing or
 * permission was refused, as `pwa/badge.ts` does.
 */
function updateBadge(): Promise<void> {
  if (!('setAppBadge' in self.navigator)) return Promise.resolve();
  const nav = self.navigator as WorkerNavigator & {
    setAppBadge: (n?: number) => Promise<void>;
    clearAppBadge: () => Promise<void>;
  };
  return self.registration.getNotifications()
    .then((shown) => (shown.length > 0 ? nav.setAppBadge(shown.length) : nav.clearAppBadge()))
    .catch(() => {});
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(updateBadge());
  // Both spellings of a route reduce to one here, and anything that would
  // leave the app becomes home. Four producers write these paths and they do
  // not agree on the hash -- see domain/notify/target.ts.
  const target = notificationTarget(
    self.registration.scope,
    event.notification.data?.path as string | undefined,
  );

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an open window rather than spawning a second copy of the app.
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.focus();
          return client.navigate(target).then(() => undefined);
        }
      }
      return self.clients.openWindow(target).then(() => undefined);
    }),
  );
});
