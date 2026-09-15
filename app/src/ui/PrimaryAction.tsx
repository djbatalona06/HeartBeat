import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * The one thing this screen is for.
 *
 * ## Why a component around a class that already works
 *
 * `.primary` is a perfectly good rule and nineteen buttons already use it. What
 * they do not share is anything else: some are `type="button"`, some inherit
 * `submit` by omission inside a form, and the disabled ones each decide for
 * themselves whether disabling also means saying why. A class can carry the
 * paint but not the behaviour, and the behaviour is where they drift.
 *
 * ## One per screen
 *
 * Not enforced in code, because the honest enforcement is a reviewer. But it is
 * the rule: a screen with two primary actions has no primary action, and the
 * second-most-important thing on a page is a `ListRow`.
 *
 * `busy` is separate from `disabled` on purpose. A disabled button is one you
 * may not press; a busy one is a button you already pressed. Rendering the
 * second as the first loses that, and people tap again.
 */
export interface PrimaryActionProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'type'> {
  children: ReactNode;
  /** In flight. Stays disabled, but says so as a state rather than a refusal. */
  busy?: boolean;
  type?: 'button' | 'submit';
}

export function PrimaryAction({
  children, busy, disabled, type = 'button', ...rest
}: PrimaryActionProps) {
  return (
    <button
      {...rest}
      type={type}
      className="primary"
      disabled={disabled || busy}
      // Not `aria-disabled`: the button genuinely cannot be pressed. This says
      // *why*, so a screen reader distinguishes "not yet" from "not for you".
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  );
}
