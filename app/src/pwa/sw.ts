/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { notificationTarget } from '../domain/notify/target';

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
    badge: 'icons/icon-192.png',
    data: { path: data.path ?? '/' },
  };

  event.waitUntil(self.registration.showNotification(data.title ?? 'HeartBeat', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
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
