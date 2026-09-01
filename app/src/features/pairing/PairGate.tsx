import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * The door on the front of the app.
 *
 * HeartBeat is one record kept by two phones: the pet levels from both of you,
 * the calendar is shared, the thread has two sides. On a phone that has not
 * paired yet none of that is true, and every screen was quietly writing rows
 * that would never reach anybody — so the honest thing is to say so once,
 * warmly, and point at the one action that changes it.
 *
 * A door, not a wall. Nothing here scolds, nothing is counted against you, and
 * the route you arrived on is left exactly where it was: a deep link from a
 * push notification lands here and then opens for real the moment the second
 * phone joins, rather than being redirected away and lost.
 */
export interface PairGateProps {
  /** False until settings have been read. Nothing renders on a guess. */
  ready: boolean;
  paired: boolean;
  /** Routes that stay open while unpaired, and their children. */
  open: readonly string[];
  children: ReactNode;
}

export function PairGate({ ready, paired, open, children }: PairGateProps) {
  const { pathname } = useLocation();

  // A frame of the gate on a phone that paired months ago is a flash of the
  // wrong app on every cold start, so it waits for the answer.
  if (!ready) return null;
  if (paired || isOpen(pathname, open)) return <>{children}</>;
  return <PairInvitation />;
}

function isOpen(pathname: string, open: readonly string[]): boolean {
  return open.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function PairInvitation() {
  return (
    <div className="gate">
      <p className="gate-mark" aria-hidden="true">
        <span>&hearts;</span>
        <span>&hearts;</span>
      </p>
      <h1 className="gate-title">HeartBeat takes two phones</h1>
      <p className="gate-body">
        One pet, one calendar, one thread &mdash; all of it belongs to the two of
        you together. Until the other phone joins there is nobody to keep in
        step with, so the rest of the app is waiting rather than pretending.
      </p>
      <Link className="primary gate-action" to="/settings">
        Join the two phones
      </Link>
      <p className="gate-note">
        One of you starts a pairing and reads out the code; the other types it
        in. It takes a minute, and it is the last piece of setup there is.
      </p>
      <p className="gate-note">
        Anything already logged on this phone comes along when you pair. Nothing
        written so far is lost.
      </p>
      <p className="gate-note">
        The same screen holds the themes, if you would rather arrive somewhere
        you picked.
      </p>
    </div>
  );
}
