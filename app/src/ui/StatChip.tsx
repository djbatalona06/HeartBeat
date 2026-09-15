import type { ReactNode } from 'react';
import { Icon } from '../components/icons';
import type { IconName } from '../nav';

/**
 * One number, with enough around it to know what it is.
 *
 * ## What it is not
 *
 * The reference this overhaul draws from has a row of these across the top:
 * gems, gold, and an energy meter, each with a `+` that opens a shop. That row
 * is a storefront, and it is the one thing from that screen this app must not
 * copy — HeartBeat has no currency to top up and nothing to sell.
 *
 * So a `StatChip` shows something the couple *did*: mood, energy, a streak, how
 * full the tether is. There is no `+`, no affordance to buy, and the chip is
 * not pressable by default, because a number about your own week is information
 * rather than an offer.
 *
 * ## The trend is optional and unsigned on purpose
 *
 * `trend` says 'up', 'down' or nothing, and renders as a mark rather than a
 * percentage. A number falling is not a failure here — a quiet fortnight is
 * allowed — so it gets an arrow and not a red minus sign.
 */
export interface StatChipProps {
  icon?: IconName;
  /** What the number is. Kept short; this sits in a row of three or four. */
  label: string;
  value: ReactNode;
  trend?: 'up' | 'down';
  /**
   * Makes the chip a button. For the few that genuinely lead somewhere — a
   * mood chip opening the mood page — and never for a chip that only reports.
   */
  onClick?: () => void;
}

export function StatChip({ icon, label, value, trend, onClick }: StatChipProps) {
  const inner = (
    <>
      {icon && <Icon name={icon} />}
      <span className="statchip-value">{value}</span>
      <span className="statchip-label">{label}</span>
      {trend && (
        <span className="statchip-trend" data-dir={trend} aria-hidden="true">
          {trend === 'up' ? '▴' : '▾'}
        </span>
      )}
    </>
  );

  // The label is already in the chip, so the accessible name repeats it with
  // the value attached: "Streak, 4 days" reads better than "4" then "Streak".
  const name = `${label}, ${typeof value === 'string' || typeof value === 'number' ? value : ''}`.trim();

  if (onClick) {
    return (
      <button type="button" className="statchip" onClick={onClick} aria-label={name}>
        {inner}
      </button>
    );
  }
  return <div className="statchip" role="group" aria-label={name}>{inner}</div>;
}
