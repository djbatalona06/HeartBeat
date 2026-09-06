/**
 * Getting a crash off the phone it happened on.
 *
 * Kept out of `components/ErrorBoundary.tsx` so the boundary imports nothing
 * that touches Dexie: the boundary has to render when the database, the theme
 * engine, or a live query is the thing that threw, and a module graph that
 * pulls those in on the way to the fallback defeats the purpose.
 *
 * The bearer is therefore read from a localStorage mirror rather than from
 * settings. `savePairing` writes it there at the same moment it writes the real
 * one to Dexie. Nothing new is exposed by that: the token already sits in
 * IndexedDB on the same origin, and anything able to read one can read both.
 */

const TOKEN_MIRROR_KEY = 'heartbeat.reportToken';

/** Enough to debug from, small enough that a phone posts it on a bad connection. */
export const MAX_STACK = 4000;
const MAX_MESSAGE = 500;

export interface CrashReport {
  scope: string;
  message: string;
  stack: string;
  componentStack: string;
  route: string;
  at: number;
}

export function rememberReportToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_MIRROR_KEY, token);
  } catch {
    // Private mode or blocked site data. Crashes then go unreported, which is
    // strictly better than pairing failing because a mirror could not be kept.
  }
}

export function forgetReportToken(): void {
  try {
    localStorage.removeItem(TOKEN_MIRROR_KEY);
  } catch {
    // See above.
  }
}

export function readReportToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_MIRROR_KEY);
  } catch {
    return null;
  }
}

export function buildReport(
  scope: string,
  error: Error,
  componentStack: string | null | undefined,
  route: string,
  at: number,
): CrashReport {
  return {
    scope,
    message: error.message.slice(0, MAX_MESSAGE),
    stack: (error.stack ?? '').slice(0, MAX_STACK),
    componentStack: (componentStack ?? '').slice(0, MAX_STACK),
    route,
    at,
  };
}

/**
 * Fire-and-forget, and silent on failure: a boundary that surfaced its own
 * reporting error would be showing the wrong error. `keepalive` so a crash on
 * the way out of the app still gets sent.
 *
 * The token is passed in rather than read here, matching every function in
 * `pwa/api.ts`: it keeps this testable without a DOM, and keeps the one place
 * that touches localStorage down to a try/catch.
 *
 * A null token — an unpaired phone — posts nothing. That is deliberate: an
 * endpoint that accepted anonymous writes would be an unauthenticated way into
 * the couple's database, which is a worse problem than an unreported crash.
 */
export async function sendReport(report: CrashReport, token: string | null): Promise<void> {
  if (!token) return;
  try {
    await fetch(`${import.meta.env.BASE_URL}api/crash`, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(report),
    });
  } catch {
    // Offline, or the function is not deployed yet. The console line the
    // boundary writes is still there for anyone debugging the device.
  }
}
