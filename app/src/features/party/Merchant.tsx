import { useState, type ReactNode } from 'react';

/**
 * The merchant: the buy-it-outright half of the shop, folded away.
 *
 * This was "Purchases", and it listed every gear piece and every piece of
 * furniture at full price -- the whole catalogue in a drawer. It is the
 * merchant now, with a short shelf that changes daily and is cheaper than
 * anywhere else; see `domain/rpg/merchant.ts`.
 *
 * The chests are the shop and this is a drawer under it. Collapsed by default,
 * one tap to open.
 *
 * A `<button>` with `aria-expanded` and plain conditional children rather than
 * `<details>`, because `<details>` cannot be animated open on Safari without
 * measuring it, and cannot be styled to match the rest of the panels without
 * fighting the marker.
 */

export interface MerchantProps {
  /** Rendered only once the drawer is open — the shelf's live
   *  queries have no business running for a drawer nobody has opened. */
  children: ReactNode;
}

export function Merchant({ children }: MerchantProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel purchases" data-open={open || undefined}>
      <button
        type="button"
        className="purchases-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="purchases-head">
          <span className="section-title">Merchant</span>
          <span className="section-sub">
            Today’s deals, a little cheaper than anywhere else, and new each day.
          </span>
        </span>
        <span className="purchases-chevron" aria-hidden="true" />
      </button>

      {open && <div className="purchases-body">{children}</div>}
    </section>
  );
}
