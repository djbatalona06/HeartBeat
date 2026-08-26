/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
  const path = (event.notification.data?.path as string) ?? '/';
  const scope = self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an open window rather than spawning a second copy of the app.
      for (const client of clients) {
        if (client.url.startsWith(scope) && 'focus' in client) {
          client.focus();
          return client.navigate(`${scope}#${path}`).then(() => undefined);
        }
      }
      return self.clients.openWindow(`${scope}#${path}`).then(() => undefined);
    }),
  );
});
