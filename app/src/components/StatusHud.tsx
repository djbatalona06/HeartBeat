import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { ensureIdentity, getOrCreateAvatar } from '../db/repository';
import { levelOf } from '../domain/rpg/avatar';
import { Icon } from './icons';

/**
 * Level and coins, top right, on every screen.
 *
 * The two numbers that decide what you can do next were on four different
 * screens and on none of them at once: the level gated gear and locations from
 * inside the Bag, the balance was a line in the middle of the Shop, and Home —
 * the screen the app opens on — showed the *pet's* level, which is the
 * couple's and is not this one. So the answer to "can I afford that yet" cost
 * two taps and a scroll, and a purchase made in the Shop left no visible trace
 * anywhere else.
 *
 * It reads `db.avatars`, which is the same row the Bag totals and every
 * purchase debits, through a live query — so the badge is not a copy that can
 * drift. Spend in the Shop and it ticks down here in the same frame the item
 * lands in the bag; finish a task and the level moves without a reload.
 *
 * Tapping it opens the Bag, because "what do I have" is the question a wallet
 * makes you ask.
 *
 * Mounted beside `MenuSheet` in App.tsx rather than inside a page, for the same
 * reason the menu button is: there is no header component — every page draws
 * its own `.page-head` — and a badge that reappeared per screen would be four
 * copies of this and a different corner on each one.
 */

/**
 * The two screens this stays off.
 *
 * Onboarding ends by *revealing* the starting wallet alongside the first item
 * (see `grantStarterItem`), and a badge already sitting in the corner saying
 * 120 would give that away before it is given. The welcome screen is the same
 * argument one step earlier: the app has not introduced itself yet, so a
 * number is not what it should be showing. Matched on the path rather than on
 * `settings.onboarded` on purpose — reading settings here would mean
 * `loadSettings` inside a live query, which re-fires up to twenty times a
 * foreground cycle.
 */
const BEFORE_THE_APP = ['/welcome', '/onboarding'];
export function StatusHud() {
  // Settings carries an identity only once something else has written one.
  // Minting it here too is what lets a first run show a starting balance
  // rather than an empty corner; `ensureIdentity` is idempotent, and
  // `getOrCreateAvatar` mints the row at STARTER_COINS exactly once.
  const { pathname } = useLocation();
  const hidden = BEFORE_THE_APP.includes(pathname);

  const [memberId, setMemberId] = useState<string | null>(null);
  useEffect(() => {
    if (hidden) return;
    let live = true;
    ensureIdentity()
      .then(async (identity) => {
        await getOrCreateAvatar(identity.memberId, identity.coupleId);
        if (live) setMemberId(identity.memberId);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [hidden]);

  const avatar = useLiveQuery(
    () => (memberId ? db.avatars.get(memberId) : undefined),
    [memberId],
  );

  if (hidden) return null;

  // Nothing rather than zeroes while the row is on its way: a badge that reads
  // "Lv 1 · 0" for a frame and then jumps is worse than one that arrives late.
  if (!avatar) return null;

  const level = levelOf(avatar);
  return (
    <NavLink
      to="/assets"
      className="status-hud"
      aria-label={`Level ${level}, ${avatar.coins} ${avatar.coins === 1 ? 'coin' : 'coins'}. Open the bag.`}
    >
      <span className="status-hud-cell">
        <span className="status-hud-key" aria-hidden="true">Lv</span>
        <span className="status-hud-value">{level}</span>
      </span>
      <span className="status-hud-rule" aria-hidden="true" />
      <span className="status-hud-cell">
        <span className="status-hud-glyph" aria-hidden="true"><Icon name="coin" /></span>
        <span className="status-hud-value">{avatar.coins}</span>
      </span>
    </NavLink>
  );
}
