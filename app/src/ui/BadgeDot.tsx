/**
 * "There is something here."
 *
 * ## One component, and later one source
 *
 * Today the whole app has exactly one novelty indicator: an unread count in
 * `features/chat/ChatPanel.tsx`, computed inline from a `useRef` of how many
 * messages had been seen — so it resets to zero on every reload, and no other
 * surface has one at all.
 *
 * This is the component half of fixing that. The data half is `deriveBadges` in
 * Phase 4, and the rule that comes with it is that **no component computes its
 * own dot**: every badge in the app reads from one pure function over synced
 * state, or it does not exist. Until that lands, this takes an explicit prop —
 * which is deliberately awkward, because a component that could invent its own
 * count is a component that will.
 *
 * ## A dot means waiting, never missed
 *
 * The first of the three traps this overhaul is gated on is gamified anxiety.
 * A badge that says "your partner sent something" is an invitation. A badge
 * that says "you didn't log yesterday" is a scold with a red circle on it, and
 * this app does not ship those — `domain/notify/schedule.ts` already argues the
 * same line about reminders.
 *
 * So there is no `danger` variant here, and adding one should require arguing
 * with this paragraph first.
 */
export interface BadgeDotProps {
  /**
   * How many things are waiting. `0` renders nothing at all — not an empty
   * circle, which is a dot that has to be looked at to learn it is empty.
   */
  count?: number;
  /**
   * What is waiting, for a screen reader: "3 unread messages".
   *
   * Required, and not defaulted to something like "new items". A dot with a
   * generic label is an announcement that tells somebody using a screen reader
   * that something happened without telling them what, which is worse than
   * silence.
   */
  label: string;
  /**
   * Show a plain dot instead of a number.
   *
   * For "there is something new" where the count is not the point — a quest
   * that became available is one fact, not one item.
   */
  quiet?: boolean;
}

export function BadgeDot({ count = 0, label, quiet }: BadgeDotProps) {
  if (count <= 0) return null;
  return (
    <span className="badge-dot" data-quiet={quiet ? 'true' : 'false'} role="status">
      <span className="visually-hidden">{label}</span>
      {/* The number is decoration: the label above already said it in words,
          and a screen reader reading "3" twice is a stutter, not emphasis. */}
      {!quiet && <span aria-hidden="true">{count > 9 ? '9+' : count}</span>}
    </span>
  );
}
