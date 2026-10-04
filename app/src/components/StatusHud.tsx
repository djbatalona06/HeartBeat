import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { ensureIdentity, getOrCreateAvatar } from '../db/repository';
import { levelForXp } from '../domain/xp';
import { Icon } from './icons';

/**
 * The pet's level and your coins, top right, on every screen.
 *
 * The level is the shared pet's, the same number Home shows. It used to be this
 * member's own, which put two different "Lv" figures on the two screens people
 * look at most. Gear and place gates still read the member's level and say so
 * in their own copy. The balance was a line in the middle of the Shop, and a
 * purchase made there left no visible trace anywhere else; here it ticks down.
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
export const BEFORE_THE_APP = ['/welcome', '/onboarding'];
export function StatusHud() {
  // Settings carries an identity only once something else has written one.
  // Minting it here too is what lets a first run show a starting balance
  // rather than an empty corner; `ensureIdentity` is idempotent, and
  // `getOrCreateAvatar` mints the row at STARTER_COINS exactly once.
  const { pathname } = useLocation();
  const hidden = BEFORE_THE_APP.includes(pathname);

  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  useEffect(() => {
    if (hidden) return;
    let live = true;
    ensureIdentity()
      .then(async (next) => {
        await getOrCreateAvatar(next.memberId, next.coupleId);
        if (live) setIdentity(next);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [hidden]);

  const memberId = identity?.memberId;
  const coupleId = identity?.coupleId;
  const avatar = useLiveQuery(
    () => (memberId ? db.avatars.get(memberId) : undefined),
    [memberId],
  );
  // Tagged with the couple it was read for: a live query keeps its last answer
  // while its key changes, and an untagged `null` ("no pet") would pass for this
  // couple's answer and flash level 1.
  const petRead = useLiveQuery(
    async () => (coupleId ? { for: coupleId, xp: (await db.pet.get(coupleId))?.xp ?? 0 } : undefined),
    [coupleId],
  );

  if (hidden) return null;

  // Nothing rather than zeroes while the row is on its way: a badge that reads
  // "Lv 1 · 0" for a frame and then jumps is worse than one that arrives late.
  if (!avatar || !petRead || petRead.for !== coupleId) return null;

  // The shared pet's level, the one Home shows -- not this member's own. Both
  // come off the same 50-level curve in `domain/xp.ts`, so they can only differ
  // by whose XP is fed in, and a header that disagreed with Home was a bug.
  const level = levelForXp(petRead.xp);
  return (
    <NavLink
      to="/assets"
      className="status-hud"
      aria-label={`Pet level ${level}, ${avatar.coins} ${avatar.coins === 1 ? 'coin' : 'coins'}. Open the bag.`}
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
