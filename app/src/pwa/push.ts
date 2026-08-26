export class PushError extends Error {}

/**
 * VAPID keys travel as base64url and must reach the browser as bytes. The
 * buffer is allocated explicitly rather than via `new Uint8Array(length)`:
 * TypeScript 5.7 widened that to `Uint8Array<ArrayBufferLike>`, which no longer
 * satisfies `BufferSource` because it might be backed by a SharedArrayBuffer.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normal);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export interface SerializedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function serializeSubscription(sub: PushSubscription): SerializedSubscription {
  const json = sub.toJSON();
  const keys = json.keys ?? {};
  if (!json.endpoint || !keys.p256dh || !keys.auth) {
    throw new PushError('the browser returned an incomplete push subscription');
  }
  return { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function enablePush(vapidPublicKey: string): Promise<SerializedSubscription> {
  if (!('serviceWorker' in navigator)) throw new PushError('this browser has no service worker support');
  if (!('PushManager' in window)) throw new PushError('this browser has no push support');

  // iOS only surfaces the prompt from inside a user gesture in an installed
  // app, and a denial can only be undone by deleting and re-adding the icon.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError(`notification permission was ${permission}`);

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return serializeSubscription(existing);

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  return serializeSubscription(sub);
}
