import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings } from '../../db/database';
import { rekeyIdentity } from '../../db/repository';
import { isUsableIdentity, sameIdentity, type Identity } from '../../domain/identity/rekey';

/**
 * Whether this phone has a partner yet, and the repair that runs the moment it
 * gets one.
 *
 * The repair is here rather than in Settings on purpose. Settings owns the
 * pairing form and does not need to know that re-keying exists; this hook is
 * mounted for the whole life of the app, so it sees the identity change however
 * it happens — a pairing started here, a code typed in, or a couple re-pairing
 * a year from now.
 */

/**
 * The identity this device last knew itself by, kept outside Dexie so that
 * pairing — which overwrites the ids in settings — cannot take the old pair
 * with it. Per-device and disposable, which is what localStorage is for.
 */
const LAST_IDENTITY_KEY = 'heartbeat.identity';

function readLastIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(LAST_IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity> | null;
    return isUsableIdentity(parsed) ? parsed : null;
  } catch {
    // Private mode, blocked site data, or something else's key under this name.
    // A device that cannot remember its old identity simply has nothing to
    // repair, which is also true of every phone that pairs before it logs.
    return null;
  }
}

function rememberIdentity(identity: Identity): void {
  try {
    localStorage.setItem(LAST_IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // See above.
  }
}

// StrictMode mounts effects twice in development, and a re-key running twice at
// once is wasted work rather than a fault. One at a time anyway.
let repairing = false;

async function repair(before: Identity, now: Identity): Promise<void> {
  if (repairing) return;
  repairing = true;
  try {
    await rekeyIdentity(before, now);
    // Only once the rows have actually moved. If the write failed, the old pair
    // stays remembered and the next launch tries again.
    rememberIdentity(now);
  } catch (err) {
    console.warn('identity re-key failed; it will be retried', err);
  } finally {
    repairing = false;
  }
}

export interface Pairing {
  /** False until settings have been read, so nothing decides on a guess. */
  ready: boolean;
  /** Both halves of the couple exist and this phone holds a token. */
  paired: boolean;
}

export function usePairing(): Pairing {
  const settings = useLiveQuery(loadSettings, []);
  const memberId = settings?.memberId;
  const coupleId = settings?.coupleId;

  useEffect(() => {
    const now = { memberId, coupleId };
    if (!isUsableIdentity(now)) return;
    const before = readLastIdentity();
    if (!before || sameIdentity(before, now)) {
      rememberIdentity(now);
      return;
    }
    void repair(before, now);
  }, [memberId, coupleId]);

  return {
    ready: settings !== undefined,
    paired: Boolean(coupleId && settings?.workerSecret),
  };
}
