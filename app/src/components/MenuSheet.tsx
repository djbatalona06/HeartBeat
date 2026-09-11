import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MENU_GROUPS, OPEN_WHILE_UNPAIRED } from '../nav';
import { Icon } from './icons';

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
 * Built here rather than pulled in, for the reason `CommandMenu` and
 * `DeadlinePicker` were: this stylesheet is hand-written and driven by a
 * runtime theme engine, and a component library would arrive with its own.
 * The scrim, the escape key and the click-out are `CommandMenu`'s, because a
 * second dialog behaving differently from the first is worse than either.
 */
export function MenuSheet({ locked }: { locked: boolean }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const close = useCallback(() => setOpen(false), []);

  // Navigating is the point of the menu, so arriving somewhere closes it. This
  // watches the location rather than each link's onClick: a tap on the tab you
  // are already on should close it too, and that fires no navigation.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { close(); button.current?.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Focus moves into the panel on open. Without this the menu opens behind the
  // keyboard user, who is still on the button with nothing to tab into.
  useEffect(() => {
    if (open) panel.current?.querySelector('a')?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="menu-button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((was) => !was)}
      >
        <Icon name="menu" />
      </button>

      {open ? (
        <div className="menu-scrim" onClick={close}>
          <div
            ref={panel}
            className="menu-panel"
            role="menu"
            aria-label="Everywhere else"
            onClick={(event) => event.stopPropagation()}
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
          </div>
        </div>
      ) : null}
    </>
  );
}
