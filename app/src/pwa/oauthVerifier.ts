/**
 * The browser's half of a sign-in.
 *
 * Starting "get back in" or "connect" invents a random secret, keeps it here,
 * and sends the server only its SHA-256. The one-time claim the redirect brings
 * back can then only be spent by presenting the secret itself — which only the
 * browser that started the sign-in has. A callback URL handed to somebody else
 * is therefore worth nothing to them. See `worker/migrations/0020`.
 *
 * It lives in `localStorage` for a few minutes rather than in memory because
 * the round trip leaves the page entirely: the provider's site is a full
 * navigation, and everything held in the app is gone when it comes back.
 * Kept per provider so starting one cannot overwrite the other's.
 */

type Provider = 'github' | 'google';

/** Just the three calls used, so a test can hand in a plain Map-backed stub. */
export type VerifierStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Longer than the server's ten minutes to authorise, so a slow sign-in is
 *  never the client's fault; shorter than "forever", so one is not left lying
 *  around if the person wanders off. */
const KEEP_MS = 15 * 60 * 1000;

const key = (provider: Provider) => `heartbeat.oauth.verifier.${provider}`;

export function newVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lowercase hex, which is exactly what the server's `hashToken` produces. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function rememberVerifier(
  provider: Provider,
  verifier: string,
  now = Date.now(),
  store: VerifierStore = localStorage,
): void {
  try {
    store.setItem(key(provider), JSON.stringify({ verifier, at: now }));
  } catch {
    // Blocked storage means the sign-in cannot be completed here, which the
    // claim step reports plainly. Nothing useful to do at this point.
  }
}

/** Read it once and forget it. A spent verifier is never worth keeping. */
export function takeVerifier(
  provider: Provider,
  now = Date.now(),
  store: VerifierStore = localStorage,
): string | undefined {
  try {
    const raw = store.getItem(key(provider));
    store.removeItem(key(provider));
    if (!raw) return undefined;
    const held = JSON.parse(raw) as { verifier?: unknown; at?: unknown };
    if (typeof held.verifier !== 'string' || typeof held.at !== 'number') return undefined;
    return now - held.at <= KEEP_MS ? held.verifier : undefined;
  } catch {
    return undefined;
  }
}
