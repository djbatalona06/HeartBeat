import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import type { IconName } from '../nav';

interface TileProps {
  to: string;
  title: string;
  icon: IconName;
  /** The one number or phrase worth reading at a glance. */
  value: ReactNode;
  hint?: string;
}

/** One cell of the dashboard grid. */
export function Tile({ to, title, icon, value, hint }: TileProps) {
  return (
    <Link to={to} className="tile">
      <div className="tile-head">
        <span className="tile-glyph"><Icon name={icon} /></span>
        <span className="tile-title">{title}</span>
      </div>
      <div className="tile-value">{value}</div>
      {hint ? <div className="tile-hint">{hint}</div> : null}
    </Link>
  );
}
