import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings } from '../../db/database';
import { installState } from '../../pwa/install';

/** Always reachable, regardless of what the gate below would otherwise say —
 *  the two screens that answer its questions, and Settings, which is where
 *  onboarding hands off to pairing. */
const EXEMPT = ['/welcome', '/onboarding', '/settings'];

export interface FirstRunGateProps {
  children: ReactNode;
}

/**
 * Where a fresh visitor lands before anything else — outside `PairGate`, so
 * it runs even for someone who will never pair, and answers a different
 * question than that gate does. `PairGate` asks whether there are two of you
 * yet; this asks whether the *one* of you here has actually met the app.
 *
 * Two checks, in order. First: is this the installed app, or a browser tab.
 * iOS only delivers Web Push to a web app added to the Home Screen and opened
 * from that icon, so a browser visitor is told what that costs them once,
 * warmly, with an escape hatch — "look around anyway" sets
 * `guestAcknowledged` and is remembered, never asked twice. Second, once past
 * that: has this phone been introduced to the app at all. Neither check ever
 * blocks the screens that answer it, or Settings, which is where the second
 * one hands off to pairing.
 */
export function FirstRunGate({ children }: FirstRunGateProps) {
  const { pathname } = useLocation();
  const settings = useLiveQuery(loadSettings, []);

  // Nothing renders on a guess — the same rule PairGate follows, and for the
  // same reason: a frame of the wrong screen on every cold start.
  if (!settings) return null;
  if (EXEMPT.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return <>{children}</>;
  }

  if (installState() !== 'installed' && !settings.guestAcknowledged) {
    return <Navigate to="/welcome" replace />;
  }
  if (!settings.onboarded) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
