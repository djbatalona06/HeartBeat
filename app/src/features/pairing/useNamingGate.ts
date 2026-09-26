import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { saveMembersFromServer } from '../../db/repository';
import { fetchProfiles } from '../../pwa/api';
import { isPaired } from '../../domain/identity/rekey';
import { showNamingGate } from './namingGate';

/**
 * Whether the naming screen should be showing right now, and what it needs to
 * say — read once here so `App` can lock the tab bar and menu the same way it
 * does for `PairGate`, and the gate itself does not have to re-derive it.
 */
export interface NamingGateInfo {
  /** False until settings and the members table have both been read. */
  ready: boolean;
  show: boolean;
  /** The specific person this device is now linked with, if they have a name. */
  partnerName: string | undefined;
  workerSecret: string | undefined;
}

export function useNamingGate(): NamingGateInfo {
  const settings = useLiveQuery(loadSettings, []);
  const members = useLiveQuery(() => db.members.toArray(), []);

  const ready = settings !== undefined && members !== undefined;
  const mine = members?.find((m) => m.id === settings?.memberId);
  const theirs = members?.find((m) => m.id !== settings?.memberId);
  const memberCount = members?.length ?? 0;
  const token = settings?.workerSecret;

  /**
   * This gate can only ever fire once the partner's own member row has
   * arrived — and that row used to appear only once the Settings screen
   * happened to mount, because `Partner`'s own `fetchProfiles` effect was the
   * only thing that ever pulled it. Mounted here instead, this runs the
   * moment a token exists, wherever in the app that turns out to be, which is
   * what lets the gate appear without a detour through Settings first. Still
   * safe to run twice — the same GET Settings also fires, newest-wins.
   */
  useEffect(() => {
    if (!ready || !token || !isPaired(settings) || memberCount >= 2) return;
    let live = true;
    fetchProfiles(token)
      .then((rows) => { if (live) void saveMembersFromServer(rows); })
      .catch(() => { /* offline is the normal case; this retries next render */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, memberCount]);

  return {
    ready,
    show: ready && showNamingGate({
      paired: isPaired(settings),
      memberCount,
      myName: mine?.displayName,
      seen: settings?.namingGateSeen === true,
    }),
    partnerName: theirs?.displayName,
    workerSecret: token,
  };
}
