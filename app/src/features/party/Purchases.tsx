import { useState, type ReactNode } from 'react';

/**
 * The buy-it-outright half of the shop, folded away.
 *
 * The shop grew four purchase panels — gear, furniture, colourways, and the
 * day's offer — and stacked one after another they were the whole page, which
 * put a screen about spending money in front of somebody every time they went
 * looking for a chest.
 *
 * So the chests are the shop and this is a drawer under it. Collapsed by
 * default, one tap to open, and the contents are exactly what they were: this
 * moves the panels, it does not change a single price or a single button.
 *
 * A `<button>` with `aria-expanded` and plain conditional children rather than
 * `<details>`, because `<details>` cannot be animated open on Safari without
 * measuring it, and cannot be styled to match the rest of the panels without
 * fighting the marker.
 */

export interface PurchasesProps {
  /** Rendered only once the drawer is open — four panels' worth of live
   *  queries have no business running for a drawer nobody has opened. */
  children: ReactNode;
}

export function Purchases({ children }: PurchasesProps) {
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
          <span className="section-title">Purchases</span>
          <span className="section-sub">
            Gear, furniture, colourways, and today’s offer — bought outright.
          </span>
        </span>
        <span className="purchases-chevron" aria-hidden="true" />
      </button>

      {open && <div className="purchases-body">{children}</div>}
    </section>
  );
}
