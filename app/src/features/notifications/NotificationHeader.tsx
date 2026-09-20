import { Link } from 'react-router-dom';
import { headline } from '../../domain/notifications/derive';
import type { Badges } from './useBadges';

/**
 * One line across the top of every screen, when there is one worth saying.
 *
 * ## Why it has no dismiss button
 *
 * The obvious design is a bar with an × on the right, and it would be broken
 * for half of what it shows. Quests are deliberately **not** watermarked —
 * `derive.ts` spells out why: a finished quest clears itself by being claimed,
 * so a "seen" stamp would hide a payout nobody has taken. `markSeen('quests')`
 * is therefore a no-op by design, and an × wired to it would be a control that
 * appears to work, does nothing, and leaves the bar exactly where it was.
 *
 * `NotificationsBlock` already argues this about the reminders switch — a
 * control that cannot work means the person taps it and learns nothing. So
 * there is one control instead: the bar itself. Tapping it goes to the thing
 * and marks the badge looked at, which is the same gesture that clears the dot
 * everywhere else in the app. The bar leaves when you deal with it, and
 * dealing with it is one tap.
 *
 * That also keeps it honest about what it is. Every line it can show is
 * somebody offering you something — a payout you earned, a cheer they left —
 * so there is nothing here anyone would want to wave away unread.
 *
 * ## Why it takes the badges rather than reading them
 *
 * `App.tsx` already holds a `useBadges()` for the tab bar and the message
 * pill. A second call would mean a second set of live queries over messages,
 * cheers and quests on every render of every screen, for a bar that is usually
 * not rendering anything at all.
 */
export interface NotificationHeaderProps {
  badges: Badges;
}

export function NotificationHeader({ badges }: NotificationHeaderProps) {
  const line = headline(badges.byKey);
  // Nothing waiting, and so nothing here. Not an empty bar holding space: the
  // header is absent far more often than it is present, and a reserved strip
  // would cost every screen its first line for the rare case.
  if (!line) return null;

  return (
    // `role="status"` rather than `alert`: this is good news arriving, not
    // something interrupting. A polite live region announces it after whatever
    // the screen reader is already saying instead of cutting in.
    <div className="headline" role="status">
      <Link
        className="headline-link"
        to={line.to}
        onClick={() => { void badges.markSeen(line.key); }}
      >
        <span className="headline-text">{line.text}</span>
        <span className="headline-go" aria-hidden="true">›</span>
      </Link>
    </div>
  );
}
