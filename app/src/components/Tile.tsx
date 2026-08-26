import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface TileProps {
  to: string;
  title: string;
  glyph: string;
  /** The one number or phrase worth reading at a glance. */
  value: ReactNode;
  hint?: string;
}

/** One cell of the dashboard grid. */
export function Tile({ to, title, glyph, value, hint }: TileProps) {
  return (
    <Link to={to} className="tile">
      <div className="tile-head">
        <span className="tile-glyph" aria-hidden="true">{glyph}</span>
        <span className="tile-title">{title}</span>
      </div>
      <div className="tile-value">{value}</div>
      {hint ? <div className="tile-hint">{hint}</div> : null}
    </Link>
  );
}
