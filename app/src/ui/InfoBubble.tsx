import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sheet } from './Sheet';
import { PrimaryAction } from './PrimaryAction';

export interface GuideCopy {
  /** The page or panel's name, as its heading says it. */
  title: string;
  /** What to do here, in order. */
  steps: readonly string[];
  /** What doing it is worth in the game, or how it reaches the garden. */
  game: string;
}

/**
 * The (i) beside a page title or a stat heading, and the guide it opens.
 *
 * A popup over the page rather than a line under the title: the guide is for
 * the first visit and the confused one, and a paragraph that sat on every
 * screen forever would be the noise the page subtitles were kept short to
 * avoid. Two collapsible parts, because they answer two different questions --
 * "what do I tap" first and open, "what is it worth" second and folded.
 *
 * Portalled to `document.body`, because it is rendered inside page titles and
 * `.page > .page-head` animates in with a `transform`: a transformed ancestor
 * becomes the containing block for `position: fixed`, so the popup opened
 * pinned to the title, under the rest of the page. `LoginPopup` never had the
 * problem only because it is mounted at the app root.
 *
 * Collapsible the way the Merchant is (a button with `aria-expanded` and
 * conditional children) rather than `<details>`, for the reasons written at
 * the top of `features/party/Merchant.tsx`.
 */
export function InfoBubble({ guide }: { guide: GuideCopy }) {
  const [open, setOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const [showGame, setShowGame] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const label = `How ${guide.title} works`;

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const guideSheet = (
    <Sheet
      open={open}
      onClose={close}
      label={label}
      scrimClassName="popup-scrim"
      panelClassName="popup-panel info-guide"
    >
      <h2 className="section-title">{guide.title}</h2>

      <button
        type="button"
        className="info-guide-toggle"
        aria-expanded={showSteps}
        onClick={() => setShowSteps((v) => !v)}
      >
        How it works
        <span className="purchases-chevron" aria-hidden="true" />
      </button>
      {showSteps ? (
        <ol className="info-guide-steps">
          {guide.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      ) : null}

      <button
        type="button"
        className="info-guide-toggle"
        aria-expanded={showGame}
        onClick={() => setShowGame((v) => !v)}
      >
        In the game
        <span className="purchases-chevron" aria-hidden="true" />
      </button>
      {showGame ? <p className="section-sub info-guide-game">{guide.game}</p> : null}

      <div className="popup-actions">
        <PrimaryAction onClick={close}>Got it</PrimaryAction>
      </div>
    </Sheet>
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        className="info-bubble"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">i</span>
      </button>
      {createPortal(guideSheet, document.body)}
    </>
  );
}
