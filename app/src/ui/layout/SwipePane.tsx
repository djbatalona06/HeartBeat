import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { clampPaneIndex, overBudgetWarning, paneAfterKey } from './contract';

/**
 * Up to three panes, side by side, one at a time.
 *
 * ## Built on scroll-snap, not on a transform
 *
 * The browser already knows how to page horizontally: `scroll-snap-type: x
 * mandatory` gives momentum, rubber-banding at the ends, a real scrollbar for a
 * mouse, and — the part that matters — it works before any JavaScript has run.
 * A transform-based pager reimplements all of that, badly, and reimplements it
 * again for every pointer type.
 *
 * This repo already proved the idiom: the Raid Gate's pedestal band is
 * scroll-snap and has been since it shipped. This is that, with an index and a
 * keyboard.
 *
 * ## The index is derived, never authoritative
 *
 * The scroll position is the truth. `active` is read back *out* of it on scroll
 * rather than driving it, because the alternative — state that scrolls the
 * element, and an element that sets the state — is a feedback loop that fights
 * a finger mid-swipe. Arrow keys and dot taps go through `scrollTo`, and the
 * scroll handler notices, exactly like a swipe.
 */
export interface SwipePaneProps {
  /** One node per pane. Three at most — see `contract.ts`. */
  panes: { id: string; label: string; content: ReactNode }[];
  /** Named in the dev warning and in the group's accessible name. */
  label: string;
  /**
   * Show each pane's label as a tab above the track instead of dots below it.
   * For a page whose panes are different *things* (Birb's companions, look,
   * room) rather than more of the same: a dot does not say there is a room
   * one swipe away, and a word does.
   */
  tabs?: boolean;
}

/** `inert` without React 19's typing: an empty string sets it, undefined drops it. */
const inertWhen = (on: boolean) => (on ? { inert: '' } : {}) as Record<string, string>;

export function SwipePane({ panes, label, tabs = false }: SwipePaneProps) {
  const track = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  // The track is as tall as the pane you are on. A grid row is as tall as its
  // tallest cell, so without this a short pane sat on top of the longest
  // one's height and the page scrolled into blank space under it.
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const pane = track.current?.children[active] as HTMLElement | undefined;
    if (!pane || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setHeight(pane.offsetHeight));
    observer.observe(pane);
    return () => observer.disconnect();
  }, [active, panes.length]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const warning = overBudgetWarning(label, { panes: panes.length });
    if (warning) console.warn(`[SwipePane] ${warning}`);
  }, [label, panes.length]);

  /** Which pane the scroll position is nearest. */
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el || el.clientWidth <= 0) return;
    setActive(clampPaneIndex(Math.round(el.scrollLeft / el.clientWidth), panes.length));
  }, [panes.length]);

  const goTo = useCallback((index: number) => {
    const el = track.current;
    if (!el) return;
    const next = clampPaneIndex(index, panes.length);
    el.scrollTo({
      left: next * el.clientWidth,
      // Respect a person who asked the screen to stop moving. The CSS
      // `@media (prefers-reduced-motion)` block cannot reach a scroll this
      // method starts, so it is asked here instead.
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [panes.length]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    const next = paneAfterKey(event.key, active, panes.length);
    if (next === active) return;
    event.preventDefault();
    goTo(next);
  }, [active, panes.length, goTo]);

  if (panes.length === 0) return null;

  // One control per pane: a dot, or under `tabs` the pane's own name. Real
  // buttons, because they are a real way to move -- a row of decorative dots
  // beside a thing you can swipe is a control that looks tappable and is not.
  const nav = panes.length > 1 && (
    <div className={tabs ? 'swipe-tabs' : 'swipe-dots'}>
      {panes.map((pane, i) => (
        <button
          key={pane.id}
          type="button"
          className={tabs ? 'swipe-tab' : 'swipe-dot'}
          data-on={i === active ? 'true' : 'false'}
          aria-label={tabs ? undefined : pane.label}
          aria-current={i === active}
          onClick={() => goTo(i)}
        >
          {tabs ? pane.label : null}
        </button>
      ))}
    </div>
  );

  return (
    <div className="swipe">
      {tabs ? nav : null}
      {/* `tabindex=0` so the arrows reach it, and a `group` role so a screen
          reader announces the set rather than three loose regions. */}
      <div
        className="swipe-track"
        ref={track}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="group"
        aria-label={label}
        style={height === undefined ? undefined : { height }}
      >
        {panes.map((pane, i) => (
          <section
            key={pane.id}
            className="swipe-pane"
            aria-label={pane.label}
            // A pane scrolled past is still in the DOM, so it is made inert:
            // hidden from assistive tech *and* out of the tab order. aria-hidden
            // alone left its buttons focusable, which axe calls serious.
            {...inertWhen(i !== active)}
          >
            {pane.content}
          </section>
        ))}
      </div>

      {tabs ? null : nav}
    </div>
  );
}
