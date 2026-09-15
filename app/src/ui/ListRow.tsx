import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from '../components/icons';
import type { IconName } from '../nav';

/**
 * Everything that is not the primary action.
 *
 * ## The rule it exists to enforce
 *
 * "One primary action per screen. Secondary actions become inline rows, not
 * buttons." A screen with six equally-weighted buttons has told you nothing
 * about which one you came for — and this app's screens are read one-handed,
 * half-awake, by somebody deciding whether they have the energy to log a walk.
 *
 * ## Three things, one shape
 *
 * A row either navigates, does something, or toggles something. All three look
 * identical and differ only in what the trailing edge shows — a chevron, a
 * value, or a switch — because the difference that matters to a reader is
 * *what will happen*, not what element it happens to be.
 *
 * The element follows the behaviour rather than the look: `to` renders a
 * `Link`, `onClick` renders a `button`, and neither renders a plain `div`. That
 * is the whole reason this is a component and not a class — a class cannot stop
 * somebody putting an `onClick` on a `div` and losing the keyboard with it.
 */
interface RowContent {
  icon?: IconName;
  label: ReactNode;
  /** The quiet second line. */
  hint?: ReactNode;
  /** Shown at the trailing edge: a count, a state, a chosen value. */
  value?: ReactNode;
}

export type ListRowProps = RowContent & (
  | { to: string; onClick?: never; disabled?: never }
  | { onClick: () => void; to?: never; disabled?: boolean }
  /** Neither: a row that only reports. Renders as a plain list item. */
  | { to?: never; onClick?: never; disabled?: never }
);

export function ListRow({ icon, label, hint, value, ...action }: ListRowProps) {
  const inner = (
    <>
      {icon && <span className="listrow-glyph"><Icon name={icon} /></span>}
      <span className="listrow-text">
        <span className="listrow-label">{label}</span>
        {hint && <span className="listrow-hint">{hint}</span>}
      </span>
      {value !== undefined && <span className="listrow-value">{value}</span>}
    </>
  );

  if ('to' in action && action.to) {
    return <Link className="listrow" to={action.to}>{inner}</Link>;
  }
  if ('onClick' in action && action.onClick) {
    return (
      <button
        type="button"
        className="listrow"
        onClick={action.onClick}
        disabled={action.disabled}
      >
        {inner}
      </button>
    );
  }
  // Inert on purpose, so it is not in the tab order pretending to be pressable.
  return <div className="listrow listrow-inert">{inner}</div>;
}
