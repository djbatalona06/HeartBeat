import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * The other button. "Not now", "Add a set", "Copy it out".
 *
 * ## Why this exists when `ListRow` already did
 *
 * It was missing, and adoption is what found it. The library was designed from
 * a list of components — TileCard, StatChip, PrimaryAction, ListRow — rather
 * than from the vocabulary this app actually shares, and those are not the same
 * thing. `.quiet` is thirteen buttons wide and none of them is a row: it is
 * `display: block; width: 100%`, a full-bleed secondary action that sits under
 * a primary one, and squeezing it into `ListRow` would have made thirteen
 * call sites render a list item with no list.
 *
 * The lesson is worth the file: a library built from a wishlist has gaps that
 * only show up when real code tries to use it.
 *
 * ## Same two-state split as `PrimaryAction`
 *
 * `busy` is not `disabled`. One is a button you may not press, the other is a
 * button you already pressed, and conflating them is why people tap twice.
 */
export interface SecondaryActionProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'type'> {
  children: ReactNode;
  busy?: boolean;
  type?: 'button' | 'submit';
}

export function SecondaryAction({
  children, busy, disabled, type = 'button', ...rest
}: SecondaryActionProps) {
  return (
    <button
      {...rest}
      type={type}
      className="quiet"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  );
}
