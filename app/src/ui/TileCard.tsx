import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from '../components/icons';
import type { IconName } from '../nav';

/**
 * The workhorse. A card with a heading, something inside it, and sometimes
 * somewhere to go.
 *
 * ## It replaces `.panel`, which is used fifty-eight times
 *
 * `.panel` is the most-used class in the stylesheet and it is not a component —
 * it is a background and a radius, and every one of those fifty-eight sites
 * hand-writes its own heading above it. Half use `.section-title`, some use an
 * `h2`, some use neither. The paint was shared; the structure never was.
 *
 * ## Four variants, because four things are actually different
 *
 * - `default` — a titled box. What `.panel` already is.
 * - `quest` — carries a progress line and a reward, so those two land in the
 *   same place on every quest instead of wherever the page put them.
 * - `log` — the ones you press to record something. Bigger tap target, and the
 *   whole card is the control rather than a button inside it.
 * - `companion` — a pet or mascot, where the art leads and the text follows.
 *
 * Adding a fifth should require saying what is structurally different about it.
 * A variant that only changes a colour is a prop, and a variant that only
 * changes one page is that page's own class.
 */
export interface TileCardProps {
  title?: ReactNode;
  icon?: IconName;
  children: ReactNode;
  variant?: 'default' | 'quest' | 'log' | 'companion';
  /** Makes the whole card a link. */
  to?: string;
  /** Makes the whole card a button. Ignored when `to` is set. */
  onClick?: () => void;
  /** Trailing content in the header — a count, a state, a badge. */
  aside?: ReactNode;
}

export function TileCard({
  title, icon, children, variant = 'default', to, onClick, aside,
}: TileCardProps) {
  const inner = (
    <>
      {(title || aside) && (
        <div className="tilecard-head">
          {icon && <span className="tilecard-glyph"><Icon name={icon} /></span>}
          {/* An `h2`, because a `Screen` owns the only `h1`. A card heading
              that was a `div` would leave a screen reader with no outline to
              skim, which on a page of six cards is the whole navigation. */}
          {title && <h2 className="tilecard-title">{title}</h2>}
          {aside && <span className="tilecard-aside">{aside}</span>}
        </div>
      )}
      <div className="tilecard-body">{children}</div>
    </>
  );

  const className = `tilecard tilecard-${variant}`;

  if (to) return <Link className={className} to={to}>{inner}</Link>;
  if (onClick) {
    return <button type="button" className={className} onClick={onClick}>{inner}</button>;
  }
  return <section className={className}>{inner}</section>;
}
