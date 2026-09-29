import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { badgeTotal } from '../../domain/notifications/derive';
import { showAppBadge } from '../../pwa/badge';

/**
 * Mirror the tab bar's dots onto the app icon, when the person asked for it.
 *
 * Opt-in (`settings.appBadge`), because a number on the icon is a nudge that
 * follows you out of the app. Clears itself when switched off, so turning it
 * off does not leave the last number stuck there.
 */
export function useAppBadge(byRoute: Record<string, number>): void {
  const on = useLiveQuery(async () => (await db.settings.get('settings'))?.appBadge === true, []);
  const total = badgeTotal(byRoute);
  useEffect(() => {
    if (on === undefined) return;
    showAppBadge(on ? total : 0);
  }, [on, total]);
}
