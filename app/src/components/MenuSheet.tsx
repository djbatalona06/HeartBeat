import { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MENU_GROUPS, OPEN_WHILE_UNPAIRED } from '../nav';
import { Icon } from './icons';
import { Sheet } from '../ui/Sheet';

/**
 * The three-line button, and the grid of everywhere the six tabs are not.
 *
 * The direction it opens is the whole point of the component, and it is not
 * decoration. On a phone the panel opens **upward** from the bottom edge,
 * because the button that opened it is at the top-left corner — the furthest
 * point on the screen from a thumb — and a menu that opened downward from
 * there would put every entry in the half of the screen a one-handed grip
 * cannot reach. On a tablet or a desktop the hand is not holding the device,
 * there is no thumb arc to respect, and a panel that flew up from the bottom
 * while the button sat at the top would simply be unanchored, so it opens
 * **downward** from the button like any other menu. See `.menu-panel` in
 * styles.css for the two rules; 768px is the line.
 *
 * The scrim, the escape key and the click-out now come from `ui/Sheet`, which
 * is the same argument this file used to make about copying `CommandMenu` —
 * "a second dialog behaving differently from the first is worse than either" —
 * taken one step further: one implementation rather than a careful copy. Sheet
 * adds the focus trap none of the three had, so Tab can no longer walk out of
 * the panel into the page behind the scrim.
 *
 * The paint stays here. Sheet takes both class names as props precisely so the
 * direction-flip above survives: a component that imposed its own panel would
 * take it away.
 */
export function MenuSheet({ locked }: { locked: boolean }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const close = useCallback(() => setOpen(false), []);

  // Navigating is the point of the menu, so arriving somewhere closes it. This
  // watches the location rather than each link's onClick: a tap on the tab you
  // are already on should close it too, and that fires no navigation.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <>
      <button
        type="button"
        className="menu-button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((was) => !was)}
      >
        <Icon name="menu" />
      </button>

      <Sheet
        open={open}
        onClose={close}
        label="Everywhere else"
        scrimClassName="menu-scrim"
        panelClassName="menu-panel"
      >
        {MENU_GROUPS.map((group) => (
          <section className="menu-group" key={group.title}>
            <h2 className="menu-group-title">{group.title}</h2>
            <div className="menu-grid">
              {group.tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  role="menuitem"
                  className="menu-item"
                  data-locked={locked && !OPEN_WHILE_UNPAIRED.includes(tab.to) ? 'true' : undefined}
                >
                  <span className="menu-item-glyph"><Icon name={tab.icon} /></span>
                  <span className="menu-item-label">{tab.label}</span>
                  <span className="menu-item-hint">{tab.hint}</span>
                </NavLink>
              ))}
            </div>
          </section>
        ))}
      </Sheet>
    </>
  );
}
