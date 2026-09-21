import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { dismissNotice, readWager } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { daysLeft } from '../../domain/wager/engine';
import { notices, rollup, type Notice, type Rollup } from '../../domain/notifications/events';
import type { Badges } from './useBadges';

/**
 * What the header has to say, and how to put it away.
 *
 * ## Why this is separate from `useBadges`
 *
 * `useBadges` answers "what is unread", which the tab bar, the chat pill and
 * the header all want. This answers "what is worth a line right now", which
 * only the header wants — and it costs one more live query, for the wager.
 *
 * Keeping them apart means the tab bar's dots do not re-render on a wager
 * read, and the badge hook stays the single counter that `derive.test.ts`
 * walks every source file to protect. Notices are *derived from* the badges
 * this is handed; nothing here counts anything.
 *
 * ## One query, in the shell
 *
 * Called once in `App.tsx`, next to `useBadges`, for the same reason that one
 * is: the header renders on every screen, and a query per screen for a bar
 * that is usually absent is the cost this arrangement exists to avoid.
 *
 * The raw settings row rather than `loadSettings()`, for the reason
 * `ToastHost` gives: that merges defaults on every read, and calling it inside
 * a live query re-fires the query. See CLAUDE.md.
 */

export interface Notices {
  /** The lead line and how many are behind it, or null for nothing to say. */
  rollup: Rollup | null;
  /** Everything live, which a dismissal needs in order to prune. */
  all: Notice[];
  dismiss(id: string): Promise<void>;
}

export function useNotices(badges: Badges): Notices {
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const coupleId = settings?.coupleId;
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  // The members list is passed into `readWager` rather than read inside it,
  // for the reason that function gives: it runs in a live query, and a second
  // table read there is a second thing to re-fire on.
  const members = useLiveQuery(
    async () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );

  const reading = useLiveQuery(
    async () => (coupleId && members && members.length > 0
      ? readWager(coupleId, day, members.map((member) => member.id))
      : null),
    [coupleId, day, members],
  );

  const wager = reading?.wager && reading.step
    ? {
      id: reading.wager.id,
      step: reading.step,
      target: reading.wager.target,
      daysLeft: daysLeft(reading.wager, day),
    }
    : null;

  const all = notices({ badges: badges.byKey, wager });
  const dismissed = settings?.dismissedNotifications ?? [];

  const dismiss = useCallback(
    (id: string) => dismissNotice(id, all.map((notice) => notice.id)),
    // `all` is rebuilt every render, so the ids are the honest dependency —
    // joining them is what stops a new callback identity on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all.map((notice) => notice.id).join('|')],
  );

  return { rollup: rollup(all, dismissed), all, dismiss };
}
