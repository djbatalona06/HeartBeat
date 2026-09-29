import type { Payout } from '../domain/rpg/types';

/**
 * How long a toast stays up.
 *
 * Moved here from `components/Receipt.tsx`, which is gone. Once every page
 * read its toasts from the host, `useReceipt` still existed and still worked —
 * but nothing rendered `<Receipt>` any more, so a future caller would have got
 * a buzz and no visible message. A dead hook that looks alive is worse than no
 * hook, so the file went and its surviving pieces came here.
 *
 * The name keeps `RECEIPT` rather than becoming `TOAST`, because the CSS class
 * it pairs with is still `.receipt` and renaming one without the other is how
 * the next person fails to find both.
 */
export const RECEIPT_MS = 4200;

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
