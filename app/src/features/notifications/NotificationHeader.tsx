import { Link } from 'react-router-dom';
import type { Badges } from './useBadges';
import type { Notices } from './useNotices';

/**
 * One line across the top of every screen, when there is one worth saying.
 *
 * ## What it shows now, and what it used to
 *
 * It used to show the **first** of quests and cheers and silently drop the
 * other, so with two things waiting the second was invisible until the first
 * was dealt with. And the weekly wager, which shipped with nothing surfacing
 * it anywhere, was not in the list at all.
 *
 * One line is still right — this sits above every screen in the app, and a
 * stack of bars is a screen of its own. So it is one line plus an honest count
 * of what is behind it. `domain/notifications/events.ts` decides which line
 * leads and why.
 *
 * ## Why some lines have an × and some do not
 *
 * The version before this had no dismiss button at all, and the argument for
 * that was right about quests and over-applied everywhere else. Quests are
 * deliberately **not** watermarked: a finished quest clears by being *claimed*,
 * so a "seen" stamp would hide a payout nobody has taken, `markSeen('quests')`
 * is a no-op by design, and an × wired to it would be a control that appears
 * to work and does nothing.
 *
 * That holds for anything the app **owes** you. It does not hold for the wager
 * line, which is news: not actionable, and something a person who has read it
 * should be able to put away. So the × appears exactly when
 * `Notice.clears === 'dismissing'`, and never on a payout.
 *
 * ## Why it takes both hooks rather than calling them
 *
 * `App.tsx` already holds a `useBadges()` for the tab bar and the message
 * pill, and calls `useNotices()` once beside it. Calling either here would
 * mean a fresh set of live queries on every render of every screen, for a bar
 * that is usually rendering nothing at all.
 */
export interface NotificationHeaderProps {
  badges: Badges;
  notices: Notices;
}

export function NotificationHeader({ badges, notices }: NotificationHeaderProps) {
  const shown = notices.rollup;
  // Nothing waiting, and so nothing here. Not an empty bar holding space: the
  // header is absent far more often than it is present, and a reserved strip
  // would cost every screen its first line for the rare case.
  if (!shown) return null;

  const { lead, more } = shown;

  return (
    // `role="status"` rather than `alert`: this is good news arriving, not
    // something interrupting. A polite live region announces it after whatever
    // the screen reader is already saying instead of cutting in.
    <div className="headline" role="status">
      <Link
        className="headline-link"
        to={lead.to}
        // A claiming notice is watermarked by being looked at, which is the
        // same gesture that clears the dot everywhere else in the app. A
        // dismissing one has no watermark to move — it goes when it is put
        // away, or when the news changes.
        onClick={() => {
          if (lead.clears === 'claiming' && lead.kind !== 'wager') {
            void badges.markSeen(lead.kind === 'quest' ? 'quests' : 'cheers');
          }
        }}
      >
        <span className="headline-text">{lead.text}</span>
        {/* Said rather than hidden. One line is the right shape for a bar over
            every screen; one line that pretends to be the only thing waiting
            is what this replaced. */}
        {more > 0 ? (
          <span className="headline-more">{`and ${more} more`}</span>
        ) : null}
        <span className="headline-go" aria-hidden="true">›</span>
      </Link>

      {lead.clears === 'dismissing' ? (
        <button
          type="button"
          className="headline-dismiss"
          aria-label={`Dismiss: ${lead.text}`}
          onClick={() => { void notices.dismiss(lead.id); }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
