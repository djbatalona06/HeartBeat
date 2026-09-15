import type { ReactNode } from 'react';

/**
 * Nothing here yet, said kindly.
 *
 * ## Why the copy rules are in the types
 *
 * An empty state is where an app's posture shows. "You haven't logged anything"
 * and "Nothing here yet" describe the same database, and only one of them is a
 * greeting. This app has a written position on that — `domain/notify/schedule.ts`
 * argues it about reminders, `ComplimentComposer` argues it about badges — and
 * an empty screen is the easiest place to forget it.
 *
 * So: one sentence about what the screen will hold, not about what the person
 * failed to put in it. `action` is optional because some screens are empty for
 * a good reason and offering a fix implies a fault.
 *
 * `.empty` and `.empty-sub` already exist and already look right; this is the
 * markup and the rules around them, not a new visual.
 */
export interface EmptyStateProps {
  /**
   * One sentence. Present tense, about the screen — "Nothing waiting today."
   * Not "You haven't…", which is the same fact aimed at a person.
   */
  children: ReactNode;
  /** A cozy mark. Decorative, so it is hidden from assistive tech. */
  glyph?: ReactNode;
  /** The one thing to do about it, when there is one. */
  action?: ReactNode;
}

export function EmptyState({ children, glyph, action }: EmptyStateProps) {
  return (
    <div className="empty">
      {glyph && <span className="empty-glyph" aria-hidden="true">{glyph}</span>}
      <p className="empty-sub">{children}</p>
      {action}
    </div>
  );
}
