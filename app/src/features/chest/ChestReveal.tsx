import { useEffect, useMemo, useRef, useState } from 'react';
import { chestById, showcaseOrder } from '../../domain/rpg/chests';
import { useTheme } from '../../themes/ThemeProvider';
import type { ChestOutcome } from '../../db/repository/chests';
import { PrimaryAction } from '../../ui/PrimaryAction';
import { ChestArt } from './ChestArt';
import { ChestAnimator } from './animator';
import { floorLine, prizeKindLine, prizeLine } from './receipt';

/**
 * What came out, shown rather than summarised.
 *
 * ## Why this exists at all
 *
 * A chest used to report itself as a toast: one line, gone in four seconds,
 * and identical whether it had handed over a legendary companion or refined a
 * helmet by one. With three items in a chest that is not a shortfall of
 * presentation, it is a shortfall of *information* — three things happened and
 * the toast could only name one of them.
 *
 * ## Worst first
 *
 * The items arrive in `showcaseOrder`, which is rarest **last**. The rolled
 * order is still what the repository granted them in and is still what
 * `ChestOutcome.prizes` holds; this is the order they are shown in, and a
 * reveal that builds to the best thing in the chest is the only reason to
 * reveal them one at a time rather than all at once.
 *
 * ## One implementation, two callers
 *
 * The Shop tab and the garden drawer both open chests, and they both render
 * this — the same argument `ChestAlcove`'s header makes about two published
 * odds tables. A second reveal is a second chance to describe a duplicate as
 * nothing.
 *
 * ## Dismissing
 *
 * Any tap ends it, at any point, including mid-animation: `ChestAnimator`
 * finishes rather than cancels, so the items land where they were going
 * instead of snapping back to invisible. Nothing here is behind the animation
 * — every prize is in the DOM from the first frame, which is what makes this
 * readable under calm mode, under `prefers-reduced-motion`, and to a screen
 * reader that never sees a frame of it.
 */

export interface ChestRevealProps {
  outcome: Extract<ChestOutcome, { ok: true }>;
  onDismiss(): void;
}

export function ChestReveal({ outcome, onDismiss }: ChestRevealProps) {
  const { calm } = useTheme();
  const chest = chestById(outcome.chestId);

  const chestRef = useRef<HTMLDivElement | null>(null);
  const burstRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Rarest last, so the reveal builds. Memoised because `showcaseOrder` copies
  // and this renders again on every phase.
  const shown = useMemo(() => showcaseOrder(outcome.prizes), [outcome.prizes]);

  // Whether the sequence is still running, which is the only thing the markup
  // needs to know about it: while items are still arriving the button skips
  // the rest, and once they have all landed it just closes.
  const [running, setRunning] = useState(true);

  useEffect(() => {
    const animator = new ChestAnimator(
      {
        chest: chestRef.current,
        burst: burstRef.current,
        items: itemRefs.current.slice(0, shown.length),
      },
      calm,
    );

    let live = true;
    void animator.run().then(() => { if (live) setRunning(false); });

    return () => {
      live = false;
      // The component is going away mid-sequence. Finishing rather than
      // cancelling matters even here: a cancel would leave the elements at
      // their entrance keyframe for the frame before they unmount.
      animator.cancel();
    };
  }, [calm, shown.length]);

  const floor = floorLine(outcome);

  return (
    <div
      className="chest-reveal"
      data-running={running || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`${chest?.name ?? 'Chest'} opened`}
    >
      <div className="chest-reveal-card">
        <div className="chest-reveal-lid">
          <div className="chest-reveal-art" ref={chestRef}>
            <ChestArt id={outcome.chestId} />
          </div>
          <div className="chest-reveal-burst" ref={burstRef} aria-hidden="true" />
        </div>

        <h2 className="chest-reveal-title">{chest?.name ?? 'Chest'}</h2>

        {/* One list, and it is complete from the first frame. The animation
            moves these; it does not decide whether they are here. */}
        <ul className="chest-reveal-list">
          {shown.map((prize, i) => (
            <li
              key={`${prize.kind}:${prize.itemId}:${i}`}
              className="chest-reveal-prize"
              data-rarity={prize.tier}
              data-duplicate={prize.duplicate || undefined}
              ref={(el) => { itemRefs.current[i] = el; }}
            >
              <span className="chest-reveal-prize-name">{prize.name}</span>
              <span className="chest-reveal-prize-kind">{prizeKindLine(prize)}</span>
              <span className="chest-reveal-prize-note">{prizeLine(prize)}</span>
            </li>
          ))}
        </ul>

        {/* The insurance, said out loud when it paid. A floor nobody can see
            is not a kindness -- the same sentence the alcove's header makes
            about the counter, at the moment it matters most. */}
        {floor ? <p className="chest-reveal-floor">{floor}</p> : null}

        {outcome.refunded > 0 ? (
          <p className="chest-reveal-refund">
            {outcome.refunded} coins back for what you already had.
          </p>
        ) : null}

        {/* `PrimaryAction` rather than a bare button with its own class: this
            is the one thing the dialog is for, and the primitive is what
            settles type, disabled and busy the same way everywhere. Not
            `busy` while the items are arriving -- a busy button is one you
            already pressed, and this one skips the reveal, so it has to stay
            pressable throughout. */}
        <PrimaryAction onClick={onDismiss}>
          {running ? 'Skip' : 'Good'}
        </PrimaryAction>
      </div>
    </div>
  );
}
