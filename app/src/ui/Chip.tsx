import type { ReactNode } from 'react';

/**
 * A choice you can make, and unmake.
 *
 * ## Not `StatChip`, and the difference matters
 *
 * They look alike and are opposites. `StatChip` *reports* — a mood score, a
 * streak, how full the tether is — and is not pressable unless it leads
 * somewhere. This one is *pressed*: a difficulty, a self-care area, a mood
 * word. It carries `aria-pressed`, it has an on state, and it can be locked.
 *
 * The library shipped with only the first, because it was designed from a list
 * of components rather than from the twelve `.chip` buttons already in the app.
 * Converting those into `StatChip` would have given a screen reader twelve
 * read-only groups where there were twelve toggles — which is the kind of
 * mistake that looks like a successful refactor.
 *
 * ## Two semantics, because the app has two
 *
 * `.chip-on` is what the eye reads, and it is the same class either way. What
 * differs is what the control *is*:
 *
 * - **A toggle** stands alone — filter on, filter off — and gets
 *   `aria-pressed`.
 * - **A radio** is one of a set where exactly one wins, like the difficulty
 *   picker or the area picker, and gets `role="radio"` + `aria-checked` inside
 *   a parent `role="radiogroup"`.
 *
 * Nine of the twelve chips in this app are the second kind, which is why
 * `asRadio` exists. A radio rendered with `aria-pressed` announces as "toggle
 * button" and loses the set entirely — no "2 of 6", no relationship between the
 * options — while looking completely correct on screen. That is the kind of
 * accessibility regression that ships inside a successful-looking refactor.
 *
 * Without either attribute a screen reader gets a button whose selected-ness is
 * invisible, and the control becomes "a list of words, one of which is
 * apparently special".
 */
export interface ChipProps {
  children: ReactNode;
  /** Selected. Drives `.chip-on`, and `aria-pressed` or `aria-checked`. */
  on?: boolean;
  onClick: () => void;
  /**
   * One of a set rather than a standalone toggle.
   *
   * The caller still owns the parent `role="radiogroup"` and its label — a
   * radio without a group is a radio with nothing to be one of, and this
   * component cannot see its siblings.
   */
  asRadio?: boolean;
  /**
   * Not available yet — a difficulty above the current level, an area not
   * unlocked. Rendered dimmed and genuinely disabled, so it is not a control
   * that silently does nothing.
   */
  locked?: boolean;
  /** For the destructive choice in a set. Rare; `.chip-danger` already exists. */
  danger?: boolean;
}

export function Chip({ children, on, onClick, locked, danger, asRadio }: ChipProps) {
  const classes = ['chip'];
  if (on) classes.push('chip-on');
  if (locked) classes.push('chip-locked');
  if (danger) classes.push('chip-danger');

  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={onClick}
      disabled={locked}
      role={asRadio ? 'radio' : undefined}
      // Exactly one of these, never both: a button carrying `aria-pressed` and
      // `aria-checked` at once is a control with two contradictory states.
      aria-checked={asRadio ? Boolean(on) : undefined}
      aria-pressed={asRadio ? undefined : on}
    >
      {children}
    </button>
  );
}
