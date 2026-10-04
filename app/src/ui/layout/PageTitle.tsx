import type { ReactNode } from 'react';
import { InfoBubble, type GuideCopy } from '../InfoBubble';

/**
 * A page's `h1`, with the (i) for its guide on the left.
 *
 * The left of the title rather than the corner of the screen: the corner is
 * the menu button on every route, and the title is the first thing on the
 * page that names it, so "what is this?" sits beside the word it is about.
 * The bubble is a sibling of the heading, not inside it, so the heading's
 * accessible name stays the page's name.
 */
export function PageTitle({ guide, children }: { guide?: GuideCopy; children: ReactNode }) {
  return (
    <div className="page-title-row">
      {guide ? <InfoBubble guide={guide} /> : null}
      <h1 className="page-title">{children}</h1>
    </div>
  );
}
