/**
 * The shape of something that has not arrived.
 *
 * ## Why this exists at all
 *
 * Because of the garden bug. `EveGardenPage` rendered an empty box while
 * loading and an empty box when the C# stage lookup had failed, and those were
 * the same pixels — so a screen that was broken forever looked exactly like a
 * screen that was busy for a moment. The fix had two halves: report the
 * failure, and make "loading" look like something. This is the second half,
 * generalised.
 *
 * The CSS (`.skeleton`, `.skeleton-line`, the sweep, and both motion opt-outs)
 * already shipped with that fix. This is the component around it, so the next
 * screen that waits on a query does not draw its own empty box.
 *
 * ## It is decoration, and the announcement is separate
 *
 * Every element here is `aria-hidden`. A screen reader should hear "Loading…"
 * once, from the `role="status"` its container owns — not a description of
 * three grey rectangles. That is why `Skeleton` does not render its own live
 * region: the container knows what is loading and this does not.
 */
export interface SkeletonProps {
  /** How many lines. */
  lines?: number;
  /** A block instead of lines — a card, a stage, an avatar. */
  block?: boolean;
  /** CSS `aspect-ratio`, for a block that should hold a shape. */
  ratio?: string;
}

export function Skeleton({ lines = 3, block, ratio }: SkeletonProps) {
  if (block) {
    return (
      <div
        className="skeleton skeleton-block"
        style={ratio ? { aspectRatio: ratio } : undefined}
        aria-hidden="true"
      />
    );
  }
  return (
    <div className="skeleton-lines" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton skeleton-line"
          // The last line short, the way a paragraph actually ends. A stack of
          // equal bars reads as a table; this reads as text that is coming.
          data-short={i === lines - 1 && lines > 1 ? 'true' : 'false'}
        />
      ))}
    </div>
  );
}
