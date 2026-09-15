import { useEffect, useRef, type ReactNode } from 'react';
import { overBudgetWarning } from './contract';

/**
 * A page, with its heading.
 *
 * ## What this replaced
 *
 * This exact block, retyped by hand on all thirty-one pages:
 *
 * ```tsx
 * <div className="page">
 *   <header className="page-head">
 *     <h1 className="page-title">Settings</h1>
 *     <p className="page-sub">Paired · 2026-09-15</p>
 *   </header>
 *   …
 * ```
 *
 * Thirty-one copies of a heading is thirty-one chances for one of them to use
 * an `h2`, or to drop the `<header>`, or to keep a class the stylesheet stopped
 * defining. None of those break a build; they just make one screen slightly
 * wrong, which is the failure mode this whole overhaul exists to stop.
 *
 * ## The API is small because the pages are uniform
 *
 * That was checked rather than assumed, and it decided two things:
 *
 * - **Every one of the thirty-one has both a title and a sub.** Not one has a
 *   title alone, so neither prop is optional and there is no "heading with no
 *   subtitle" layout to design.
 * - **Neither is reliably a string.** Several subs are live expressions over
 *   Dexie data — `{live.filter(…).length} of {live.length} done today` — and
 *   four titles are too (`{quiz.name}`, `{deck.title}`). So both are
 *   `ReactNode`. Typing either as `string` would force those pages to
 *   pre-format, and a pre-formatted string does not re-render when the query
 *   behind it changes: the count would silently freeze at whatever it was on
 *   first paint. That is a bug that looks fine in review and fine on load.
 *
 * `className` exists for the four pages that add a modifier (`garden`,
 * `welcome`, `onboarding`, `overworld`) and for nothing else.
 */
export interface ScreenProps {
  /** The `h1`. One per screen, because there is one screen. */
  title: ReactNode;
  /**
   * The line under it. A node rather than a string — several pages put a live
   * count here, and that has to stay reactive.
   */
  sub: ReactNode;
  children: ReactNode;
  /** A modifier beside `page`, for the four screens that have one. */
  className?: string;
  /**
   * Renders as a `<section>` instead of a `<div>`.
   *
   * Only Eve's Garden wants this today, and it wanted it before this component
   * existed — kept rather than normalised away, because changing an element in
   * a refactor whose whole claim is "nothing moved" is how a refactor stops
   * being trustworthy.
   */
  as?: 'div' | 'section';
}

export function Screen({ title, sub, children, className, as = 'div' }: ScreenProps) {
  const root = useRef<HTMLDivElement | null>(null);
  // The warning names the screen, and four titles are expressions rather than
  // text. Those get the generic name rather than a stringified React element,
  // which would read as `[object Object]` in the one message whose whole job is
  // to say which screen is too long.
  useScreenBudget(typeof title === 'string' ? title : 'Screen', root);

  const Tag = as;
  return (
    <Tag className={className ? `page ${className}` : 'page'} ref={root}>
      <header className="page-head">
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{sub}</p>
      </header>
      {children}
    </Tag>
  );
}

/**
 * Complain, in development only, about a screen that got too long.
 *
 * A warning rather than anything visible: being over budget is a design problem
 * to fix on purpose, and a couple who opened the app to log a walk should never
 * be shown the consequences of one. It is also why nothing here throws.
 *
 * `ResizeObserver` rather than a measurement on mount, because the pages that
 * grow past the ceiling grow *after* their live queries resolve — measuring
 * once would miss exactly the screens worth warning about.
 */
function useScreenBudget(title: string, root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const el = root.current;
    // `ResizeObserver` is absent in jsdom and in any non-browser render.
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    let said = false;
    const observer = new ResizeObserver(() => {
      if (said) return;
      const warning = overBudgetWarning(title, {
        scrollHeight: el.scrollHeight,
        viewportHeight: window.innerHeight,
      });
      if (!warning) return;
      // Once per mount. A screen that is too tall stays too tall, and a
      // observer firing on every scroll would bury the console.
      said = true;
      console.warn(`[Screen] ${warning}`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [title, root]);
}
