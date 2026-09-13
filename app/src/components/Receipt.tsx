import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Payout } from '../domain/rpg/types';
import { useTheme } from '../themes/ThemeProvider';
import { buzz } from '../pwa/haptics';
import type { HapticKind } from '../domain/feedback/haptics';

/**
 * "You did a thing, and here is what it was worth."
 *
 * This existed five times before it existed once. `TasksPage` had a `Receipt`
 * component it never exported, with its own 4200ms timer; `PartyPage`,
 * `FriendsPage` and `FeedPanel` each hand-rolled
 * `<div className="receipt" role="status">` around a pre-formatted string; and
 * `AssetsPage` used a *different* class while carrying a comment saying it
 * matched Party's. Five copies of one idea is five places for it to drift, and
 * it had already started: only one of them showed a payout at all.
 *
 * Consolidating it is what makes the rest affordable. Haptics land here rather
 * than at thirty call sites, so "immediate feedback for every action" costs one
 * file instead of an audit, and the next mechanic that pays out gets the
 * display, the timing, the announcement and the buzz for free.
 *
 * ### Reward attribution is structured, not a sentence
 *
 * `payout` is the `Payout` every earning path already produces, not a string
 * somebody formatted upstream. That is the difference between *showing what was
 * earned* and *printing what a screen happened to say* — and it is why adding a
 * fifth currency later changes this file and nothing else.
 */

/** How long a receipt stays up. A receipt is a moment, not a state — it clears
 *  itself, and this is the one number for all of them now rather than four
 *  copies of 4200 that were free to disagree. */
export const RECEIPT_MS = 4200;

export interface ReceiptContent {
  /** What was earned. Omitted for a receipt that is only news. */
  payout?: Payout;
  /** Plain words: "Already ticked off today", "Mochi hatched." */
  note?: string;
  /** Shown when a level actually moved, never otherwise. */
  level?: number;
  /** Which buzz, if any. Defaults to `success` when there is a payout. */
  haptic?: HapticKind | 'none';
}

/**
 * The receipt, and the thing that fires it.
 *
 * Returns `show` rather than a setter, because firing a receipt and buzzing are
 * the same event and separating them is how one of them gets forgotten.
 *
 * **`show` must be called from inside the tap**, not after an `await` — see the
 * note in `pwa/haptics.ts` about spending the user activation. In practice that
 * means buzz on the press and let the write resolve behind it.
 */
export function useReceipt() {
  const [content, setContent] = useState<ReceiptContent | null>(null);
  const { calm } = useTheme();

  // The raw row rather than `loadSettings()`, which merges defaults on every
  // read; this is one indexed get on one row, and the live query re-runs only
  // when settings actually change. Absent means on — nobody has to opt in to
  // their phone behaving normally.
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const enabled = settings?.haptics !== false;

  const show = useCallback((next: ReceiptContent) => {
    setContent(next);
    const kind = next.haptic ?? (next.payout ? 'success' : 'tap');
    if (kind !== 'none') buzz(next.level ? 'levelUp' : kind, { calm, enabled });
  }, [calm, enabled]);

  useEffect(() => {
    if (!content) return;
    const timer = setTimeout(() => setContent(null), RECEIPT_MS);
    return () => clearTimeout(timer);
  }, [content]);

  /**
   * The string case, which is four of the five screens.
   *
   * `null` clears, because the call sites it replaces were all
   * `setMessage(result.reason ?? null)` and the `??  null` is load-bearing: a
   * refusal with no stated reason should take the old receipt down rather than
   * leave a stale one up next to a thing that just failed.
   */
  const say = useCallback((note: string | null, haptic: HapticKind | 'none' = 'tap') => {
    if (note === null) { setContent(null); return; }
    show({ note, haptic });
  }, [show]);

  return { receipt: content, show, say, clear: useCallback(() => setContent(null), []) };
}

/**
 * `role="status"` rather than `alert`: this is never urgent, and an assertive
 * live region would interrupt a screen reader mid-sentence to say somebody
 * earned four coins.
 */
export function Receipt({ content }: { content: ReceiptContent | null }) {
  if (!content) return null;
  const { payout, note, level } = content;

  return (
    <div className="receipt" role="status">
      {note ? <span>{note}</span> : null}
      {payout ? <span className="receipt-payout">{payoutLine(payout)}</span> : null}
      {level ? <span className="receipt-level">Level {level}.</span> : null}
    </div>
  );
}

/**
 * Only what actually moved.
 *
 * The old TasksPage line printed all three every time, so a task that paid no
 * energy still announced "+0 energy" — which trains people to stop reading it.
 * Zeroes are dropped, and a payout of nothing at all says so in words rather
 * than rendering an empty span.
 */
export function payoutLine(payout: Payout): string {
  const parts: string[] = [];
  if (payout.xp) parts.push(`+${payout.xp} XP`);
  if (payout.coins) parts.push(`+${payout.coins} coins`);
  if (payout.energy) parts.push(`+${payout.energy} energy`);
  if (payout.mp) parts.push(`+${payout.mp} MP`);
  return parts.length ? parts.join(' · ') : 'Nothing this time.';
}
