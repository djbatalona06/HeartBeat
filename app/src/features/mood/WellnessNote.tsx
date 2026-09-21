import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { todayKey } from '../../domain/day';
import { DEFAULT_TIMEZONE } from '../../domain/types';
import {
  ADVISORY, lockedLanes, openLanes, sharedQuote,
} from '../../domain/support/shared';
import { LANE_NAMES } from '../../domain/support/lanes';

/**
 * One line the two of you are on the same page of today.
 *
 * ## Why it is not `WellnessMessageCard`
 *
 * `features/eve-garden/WellnessCards.tsx` already exists and is a different
 * thing. A second name one word away from it is a file somebody opens by
 * mistake.
 *
 * ## Where it may sit, and which lane it may draw from
 *
 * Twice on Mood, and the placement is what decides the lane — not who is
 * looking.
 *
 * `placement="open"` is the card above the cycle section, and it draws only
 * from the lanes `openLanes` allows: never `cycle-self`, never
 * `cycle-partner`. `CycleLock` guarantees that nothing behind it renders while
 * locked, and a warm line about a rough day sitting *above* the lock would
 * carry the one thing the lock exists to keep round the front of it.
 *
 * `placement="locked"` is the card inside the section, behind the PIN, where
 * the cycle lanes are the whole point. `cyclenudge.ts` already holds the same
 * line for push: the partner's copy never names the cycle.
 *
 * ## The same line on both phones, and a different one per couple
 *
 * `sharedQuote` seeds on the couple and the day, so both phones agree with
 * nothing synced between them while two different couples do not read in
 * chorus. See its header for why `pickForDay` alone could not do the second
 * half.
 *
 * ## Consent
 *
 * The locked card asks for nothing extra: it is already behind the lock, and
 * `lockedLanes` gives an unpaired or non-tracking phone an empty list, which
 * renders nothing. `shareCycleNudge` governs what the *partner* is told
 * elsewhere and is not re-litigated here — this card only ever shows the
 * viewer their own side.
 */

export interface WellnessNoteProps {
  /** Above the lock, or behind it. Decides which lanes are allowed. */
  placement: 'open' | 'locked';
}

export function WellnessNote({ placement }: WellnessNoteProps) {
  const settings = useLiveQuery(loadSettings, []);
  const coupleId = settings?.coupleId;
  const day = todayKey(settings?.timeZone ?? DEFAULT_TIMEZONE);

  // Whether the *other* one tracks, which is what opens the `cycle-partner`
  // lane. Read from the members table rather than assumed, and scoped to this
  // couple.
  const partners = useLiveQuery(
    async () => (coupleId
      ? db.members.where('coupleId').equals(coupleId).toArray()
      : []),
    [coupleId],
  );

  if (!settings || !coupleId) return null;

  const partnerTracksCycle = (partners ?? [])
    .some((member) => member.id !== settings.memberId && member.tracksCycle === true);

  const input = {
    gender: settings.gender,
    tracksCycle: settings.tracksCycle === true,
    partnerTracksCycle,
  };
  const lanes = placement === 'open' ? openLanes(input) : lockedLanes(input);
  const quote = sharedQuote(coupleId, day, lanes);

  // Nothing to say is nothing rendered. An empty panel holding space for a
  // line that is not there is worse than no line.
  if (!quote) return null;

  return (
    <aside className="wellness-note" aria-label="Something for today">
      <p className="wellness-note-lane">{LANE_NAMES[quote.lane]}</p>
      <p className="wellness-note-text">{quote.text}</p>
      {quote.attribution ? (
        <p className="wellness-note-by">{quote.attribution}</p>
      ) : null}
      {/* Only where a cycle lane could have produced the line. Said there
          because that is the context in which somebody might read more into a
          warm sentence than is actually in it. */}
      {placement === 'locked' ? (
        <p className="wellness-note-small">{ADVISORY}</p>
      ) : null}
    </aside>
  );
}
