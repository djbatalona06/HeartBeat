import type { MouseEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { OPEN_WHILE_UNPAIRED, PRIMARY_TABS } from '../../nav';
import { Icon } from '../../components/icons';
import { BadgeDot } from '../BadgeDot';
import { useBuzz } from '../../pwa/haptics';
import { slideTo } from '../../pwa/viewTransition';
import { slideDirection } from '../../domain/touch/slide';
import { useTheme } from '../../themes/ThemeProvider';

const TAB_PATHS = PRIMARY_TABS.map((tab) => tab.to);

/**
 * The six, across the bottom, as a grid.
 *
 * A grid of six equal columns rather than a flex row, so every tab is exactly
 * one sixth of the width whatever its label happens to be — "Home" and
 * "Friends" get the same target, and the bar does not shift under the thumb
 * when the active label grows. It replaces a vertical rail that had grown to
 * eight and could not have taken fourteen; see the note at the top of `nav.ts`.
 *
 * Every tab keeps its label, at every width. The rail hid all but the active
 * one below 640px because a 64px column had no room; six across the bottom of
 * even a small phone does.
 *
 * Lifted out of `App.tsx`, where it was a local function under the router, so
 * that the app shell is a shell and the navigation is a component. Behaviour is
 * unchanged: same destinations, same `end` on Home, same dimmed-not-disabled
 * treatment for a locked tab.
 *
 * ## Still six, and still no centre button
 *
 * The reference this overhaul is drawn from has five destinations plus a raised
 * primary in the middle, and that is not being copied. `nav.ts` records this
 * repo trying a different arrangement and reverting it, and `nav.test.ts` proves
 * `PRIMARY_TABS` and `MENU_GROUPS` partition `ALL_DESTINATIONS` — so dropping to
 * five means demoting a real destination into the menu, and the raised centre
 * means inventing an action for it. Both are product decisions, neither is a
 * layout primitive, and doing them quietly inside a refactor is how an
 * information architecture changes without anybody agreeing to it.
 *
 * What is new is the badge slot.
 */
export interface BottomNavProps {
  /** Unpaired: tabs that need a partner are dimmed, not removed. */
  locked: boolean;
  /**
   * Unread counts by route, e.g. `{ '/partner': 2 }`.
   *
   * Passed down from `App`, which calls `useBadges()` once for the whole shell
   * — the tab bar and the message pill want the same four live queries, and one
   * call handed to both beats two identical sets of reads on every foreground.
   * It comes from `deriveBadges` and nowhere else; see `BadgeDot`. Absent means
   * no badges, which is what an unpaired phone renders.
   */
  badges?: Record<string, number>;
}

export function BottomNav({ locked, badges }: BottomNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { calm } = useTheme();
  const tap = useBuzz();

  // The buzz first, while the tap still counts as a gesture. Then the slide,
  // which takes over the navigation only when it will actually run; otherwise
  // NavLink navigates exactly as it did before.
  const onTab = (to: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    tap('tap');
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (slideTo(() => navigate(to), slideDirection(pathname, to, TAB_PATHS), calm)) event.preventDefault();
  };

  return (
    <nav className="tabbar" aria-label="Sections">
      {PRIMARY_TABS.map((tab) => {
        const count = badges?.[tab.to] ?? 0;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className="tabbar-tab"
            onClick={onTab(tab.to)}
            data-locked={locked && !OPEN_WHILE_UNPAIRED.includes(tab.to) ? 'true' : undefined}
          >
            <span className="tabbar-glyph">
              <Icon name={tab.icon} />
              {/* On the glyph rather than the tab, so it rides the icon's
                  corner and does not shift the label's baseline when it
                  appears — a nav bar whose text moves when a message arrives
                  is a nav bar people mis-tap. */}
              <BadgeDot count={count} label={`${count} new in ${tab.label}`} quiet />
            </span>
            <span className="tabbar-label">{tab.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
