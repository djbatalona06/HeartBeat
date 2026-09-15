import type { CSSProperties } from 'react';
import { Foxglove } from '../pet/mascots/Foxglove';
import { getTheme } from '../../themes';

/**
 * "There is nothing here, and that is alright."
 *
 * One page for every dead end in the app: an address that does not exist, a
 * scene that would not load, a subpage that gave up. Before this, the wildcard
 * route was `<Navigate to="/" replace />` — an unknown hash silently teleported
 * you home with no word about why, which reads as the app losing your tap.
 *
 * ## Why the fox, and why it is always the fox
 *
 * `Foxglove` is this repository's own ink fox — original geometry, and its own
 * file notes that "the headband carries no crest or symbol of any kind". That
 * matters here rather than being trivia: `NOTICE.md` promises publicly that no
 * rights holder's character appears as artwork anywhere in this repo, and
 * `mascots/roster.test.ts` fails the build if one is named. A borrowed
 * character on the error page would break a promise the repo makes in writing.
 *
 * It is asleep (`mood="sleepy"`) because a dozing animal reads as *nothing is
 * happening here* and never as *you did something wrong* — the first of the
 * three traps this overhaul is gated on is guilt, and an error screen is where
 * guilt gets written by accident.
 *
 * ## Why all three colours are pinned, not just the accent
 *
 * Foxglove paints from three tokens, not one: `--color-accent` for the body and
 * ears, `--color-text` for the belly and muzzle, `--color-base` for the
 * headband. Pinning only the accent produced a fox that was half shinobi and
 * half whatever theme was showing — orange body, and on any light palette a
 * navy belly and a white headband, because `--color-text` there is ink. It
 * looked like a rendering fault rather than a character.
 *
 * So the wrapper pins all three, and pins them to the **dark** variant
 * specifically (`Theme.colors` is the dark palette; `Theme.light` is the other
 * one). That is the orange-on-cream fox, and it is the same fox on all five
 * themes in both modes — which is what "always the same character" has to mean
 * to be worth saying.
 *
 * The values come through the ordinary `getTheme` registry rather than being
 * typed in, so no new hex literal enters the codebase and shinobi's palette
 * stays the single source for shinobi's colours.
 *
 * Contrast is not at risk here: the drawing is `aria-hidden` decoration, and
 * its interior colours are bounded by its own orange silhouette rather than
 * sitting on the page ground.
 */
const FOX = getTheme('shinobi').colors;

export interface NotHereProps {
  /** One line, sentence case. What is not here. */
  title: string;
  /** Two lines at most. What is still true, and what to do. */
  body: string;
  /** Offered only when trying again could actually help. */
  onRetry?: () => void;
  /** Where "go home" points. A hash, because the app is a `HashRouter`. */
  homeTo?: string;
  homeLabel?: string;
}

export function NotHere({
  title,
  body,
  onRetry,
  homeTo = '#/',
  homeLabel = 'Go home',
}: NotHereProps) {
  return (
    <section className="nothere">
      {/* Decorative: the sentence below carries the whole meaning, and a screen
          reader announcing "sleeping fox" before the reason would bury it. */}
      <div
        className="nothere-mascot"
        style={{
          '--color-accent': FOX.accent,
          '--color-text': FOX.text,
          '--color-base': FOX.base,
        } as CSSProperties}
        aria-hidden="true"
      >
        <Foxglove mood="sleepy" />
      </div>

      <h1 className="nothere-title">{title}</h1>
      <p className="nothere-body">{body}</p>

      <div className="nothere-actions">
        {onRetry && (
          <button type="button" className="nothere-button" onClick={onRetry}>
            Try again
          </button>
        )}
        <a className="nothere-button nothere-button-quiet" href={homeTo}>
          {homeLabel}
        </a>
      </div>
    </section>
  );
}

/**
 * The wildcard route.
 *
 * Its own component rather than props at the call site, so the copy for "this
 * address does not exist" lives with the page that says it instead of inside
 * `App.tsx`'s route table.
 */
export function RouteNotFound() {
  return (
    <NotHere
      title="There’s nothing at this address."
      body="The link may be old, or the page may have moved. Everything you have logged is safe on this phone."
    />
  );
}
