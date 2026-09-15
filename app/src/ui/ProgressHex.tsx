import type { CSSProperties, ReactNode } from 'react';

/**
 * A number in a hexagon, with a ring that fills.
 *
 * ## Why `clip-path` and not an image
 *
 * Two reasons, and the second is the real one. An image would need five copies,
 * one per theme, re-exported whenever a palette moved — `NOTICE.md` promises
 * every graphic here is generated from code, and a hexagon asset would be the
 * first exception. And a `clip-path` costs nothing: no request, no decode, no
 * cache entry, and it recolours for free because the fill is a token.
 *
 * ## The ring is a conic gradient, not an SVG arc
 *
 * `conic-gradient` from one custom property is one declaration; an SVG arc is a
 * path whose `stroke-dasharray` has to be recomputed from the radius every time
 * the size changes. The hexagon is clipped *over* the ring, so the ring shows
 * as a border of the same shape without a second clip path to keep in step.
 *
 * ## It rounds down, deliberately
 *
 * 99.6% shows as 99, not 100. A ring that reads full when it is not is a ring
 * that says a level is finished while the last point is still owed, and this
 * app pays out on exact thresholds.
 */
export interface ProgressHexProps {
  /** 0–1. Clamped, because a caller dividing by zero should not paint outside. */
  fraction: number;
  /** What sits in the middle — usually a level. */
  children: ReactNode;
  /** The whole thing in words, since the shape carries no meaning on its own. */
  label: string;
}

export function ProgressHex({ fraction, children, label }: ProgressHexProps) {
  const safe = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const percent = Math.floor(safe * 100);

  return (
    <div
      className="progress-hex"
      style={{ '--hex-fill': `${percent}%` } as CSSProperties}
      role="img"
      aria-label={`${label}, ${percent}%`}
    >
      <span className="progress-hex-ring" aria-hidden="true" />
      <span className="progress-hex-face">{children}</span>
    </div>
  );
}
