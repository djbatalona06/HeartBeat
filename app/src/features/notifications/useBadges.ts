import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { markBadgeSeen } from '../../db/repository';
import { todayKey } from '../../domain/day';
import {
  byRoute, deriveBadges, type Badge, type BadgeKey,
} from '../../domain/notifications/derive';

/**
 * Every dot in the app, from one place.
 *
 * The Dexie half of `domain/notifications/derive.ts`. It reads, it hands the
 * rows to the pure function, and it owns nothing else — no counting, no
 * comparing, no "just this once" adjustment at the call site. That split is the
 * whole point: the counting is in a module with 22 tests and the reading is in
 * a hook with none, because one of those two is where the bugs live.
 *
 * The raw settings row rather than `loadSettings()`, for the reason `ToastHost`
 * and `SceneBackdrop` both give: that merges defaults on every read, and
 * calling it inside a live query triggers a sync rewrite that re-fires the
 * query up to twenty times a foreground cycle. See CLAUDE.md.
 */
export interface Badges {
  byKey: Record<BadgeKey, Badge>;
  /** Counts keyed by route, which is the shape `BottomNav` takes. */
  byRoute: Record<string, number>;
  /** "I have looked at this now." Monotonic; see `markBadgeSeen`. */
  markSeen: (key: BadgeKey) => Promise<void>;
}

export function useBadges(): Badges {
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const coupleId = settings?.coupleId;
  const memberId = settings?.memberId;

  const messages = useLiveQuery(
    async () => (coupleId
      ? db.messages.where('[coupleId+createdAt]')
        .between([coupleId, 0], [coupleId, Infinity]).toArray()
      : []),
    [coupleId],
  );

  const cheers = useLiveQuery(
    async () => (coupleId ? db.cheers.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );

  const quests = useLiveQuery(
    async () => (coupleId ? db.quests.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );

  const markSeen = useCallback((key: BadgeKey) => markBadgeSeen(key), []);

  const byKey = deriveBadges({
    memberId: memberId ?? '',
    today: todayKey(settings?.timeZone ?? 'America/Los_Angeles'),
    seen: settings?.badgesSeen ?? {},
    // Undefined is a query that has not answered yet, and an empty list is the
    // honest reading of it: a dot that flickers on during the first frame and
    // off again is worse than one that arrives a moment late.
    messages: messages ?? [],
    cheers: cheers ?? [],
    quests: quests ?? [],
  });

  return { byKey, byRoute: byRoute(byKey), markSeen };
}
