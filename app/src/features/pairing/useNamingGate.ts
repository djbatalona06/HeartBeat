import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { markUnlinked, saveMembersFromServer } from '../../db/repository';
import { fetchProfiles, isUnlinked } from '../../pwa/api';
import { isPaired } from '../../domain/identity/rekey';
import { partnerOf, partnerPollMs, showNamingGate } from './namingGate';

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
  const theirs = partnerOf(members, settings);
  const token = settings?.workerSecret;
  const pollMs = ready && token ? partnerPollMs(isPaired(settings), theirs) : null;

  /**
   * A single fetch on mount is not enough: the phone that started would only
   * learn its partner joined on a relaunch or a visit to Settings, and neither
   * phone would ever see the other's name arrive. `partnerPollMs` decides how
   * often to ask, and when to stop; it asks only while the app is on screen,
   * and again the moment it comes back to the foreground. Safe alongside
   * Settings' own fetch — `saveMembersFromServer` is newest-wins.
   */
  useEffect(() => {
    if (pollMs === null || !token) return;
    let live = true;
    const ask = () => {
      if (document.visibilityState !== 'visible') return;
      fetchProfiles(token)
        .then((rows) => { if (live) void saveMembersFromServer(rows); })
        .catch((e) => {
          // The server refusing this phone's token means the other one ended the
          // link. Offline is the normal case and is not that: the next tick asks.
          if (isUnlinked(e)) void markUnlinked();
        });
    };
    ask();
    const timer = setInterval(ask, pollMs);
    document.addEventListener('visibilitychange', ask);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', ask);
    };
  }, [pollMs, token]);

  return {
    ready,
    show: ready && showNamingGate({
      paired: isPaired(settings),
      hasPartner: theirs !== undefined,
      myName: mine?.displayName,
      seen: settings?.namingGateSeen === true,
    }),
    partnerName: theirs?.displayName,
    workerSecret: token,
  };
}
