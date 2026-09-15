import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useTheme } from '../themes/ThemeProvider';
import { buzz } from '../pwa/haptics';
import type { Payout } from '../domain/rpg/types';
import type { HapticKind } from '../domain/feedback/haptics';

/**
 * How long a toast stays up.
 *
 * Moved here from `components/Receipt.tsx`, which is gone. Once every page
 * read its toasts from this host, `useReceipt` still existed and still worked —
 * but nothing rendered `<Receipt>` any more, so a future caller would have got
 * a buzz and no visible message. A dead hook that looks alive is worse than no
 * hook, so the file went and its three surviving pieces came here.
 *
 * The name keeps `RECEIPT` rather than becoming `TOAST`, because the CSS class
 * it pairs with is still `.receipt` and renaming one without the other is how
 * the next person fails to find both.
 */
export const RECEIPT_MS = 4200;

export interface ReceiptContent {
  /** What was earned. Omitted for a toast that is only news. */
  payout?: Payout;
  /** Plain words: "Already ticked off today", "Mochi hatched." */
  note?: string;
  /** Shown when a level actually moved, never otherwise. */
  level?: number;
  /** Which buzz, if any. Defaults to `success` when there is a payout. */
  haptic?: HapticKind | 'none';
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

/**
 * One host for every receipt in the app.
 *
 * ## What this changed, and what it must not
 *
 * `components/Receipt.tsx` had already consolidated five hand-rolled copies
 * into one hook and one component, and everything it decided stays decided
 * here: `RECEIPT_MS`, the structured `Payout` rather than a pre-formatted
 * string, the haptic defaulting to `success` with a payout and `levelUp` on a
 * level, and `role="status"` rather than `alert` because nothing here is urgent
 * enough to interrupt a screen reader mid-sentence.
 *
 * What changed is *where* it renders. Each page used to hold its own `receipt`
 * state and render its own `<Receipt>`, which meant two pages could never show
 * one at the same time and none of them was announced from a stable live
 * region. This is one host, mounted once, with one `aria-live`.
 *
 * ## The contract that is easiest to break
 *
 * **`show` must be called from inside the tap**, before any `await`. Haptics
 * spend the user activation, and an `await` between the press and the buzz
 * spends it on nothing — the phone stays silent and the bug only appears on a
 * real device. `show` here is still synchronous and still fires `buzz` in the
 * same turn as the handler, exactly as the hook it replaced did. Anything that
 * made this async would pass every test and fail every phone.
 *
 * ## Two at once, and no more
 *
 * A stack keeps a second receipt from erasing the first when two things land
 * together — logging a workout that also completes a quest. Three would be a
 * column of notifications over a screen somebody is trying to read, so the
 * oldest falls off.
 */
const MAX_STACK = 2;

interface Toast extends ReceiptContent { id: number }

interface ToastApi {
  show(content: ReceiptContent): void;
  say(note: string | null, haptic?: ReceiptContent['haptic']): void;
  clear(): void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Mounted once, beside the other shell chrome.
 *
 * Renders nothing at all until something is shown, so it costs an empty div and
 * one subscription.
 */
export function ToastHost({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Toast[]>([]);
  const { calm } = useTheme();
  const nextId = useRef(1);

  // The raw row rather than `loadSettings()`: that merges defaults on every
  // read, and calling it from inside a live query triggers a sync rewrite which
  // re-fires the query up to twenty times a foreground cycle — see CLAUDE.md.
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const enabled = settings?.haptics !== false;

  const show = useCallback((content: ReceiptContent) => {
    const kind = content.haptic ?? (content.payout ? 'success' : 'tap');
    // Before the state update and outside any await: this is the line that
    // keeps the user activation alive.
    if (kind !== 'none') buzz(content.level ? 'levelUp' : kind, { calm, enabled });
    setStack((prev) => [...prev, { ...content, id: nextId.current++ }].slice(-MAX_STACK));
  }, [calm, enabled]);

  const say = useCallback((note: string | null, haptic: ReceiptContent['haptic'] = 'tap') => {
    // `null` clears, because the call sites this replaces were all
    // `setMessage(result.reason ?? null)` and the `?? null` is load-bearing.
    if (note === null) { setStack([]); return; }
    show({ note, haptic });
  }, [show]);

  const clear = useCallback(() => setStack([]), []);

  // One timer per toast, keyed by id, so a second arriving does not extend or
  // cut short the first — each is a moment of its own.
  useEffect(() => {
    if (stack.length === 0) return undefined;
    const oldest = stack[0];
    const timer = setTimeout(
      () => setStack((prev) => prev.filter((t) => t.id !== oldest.id)),
      RECEIPT_MS,
    );
    return () => clearTimeout(timer);
  }, [stack]);

  const api = useMemo(() => ({ show, say, clear }), [show, say, clear]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The region exists even when empty. A live region added to the document
          at the same moment its first message appears is a region screen
          readers routinely miss — it has to be there to be watched. */}
      <div className="toast-host" role="status" aria-live="polite">
        {stack.map((toast) => (
          <div className="receipt" key={toast.id}>
            {toast.note ? <span>{toast.note}</span> : null}
            {toast.payout
              ? <span className="receipt-payout">{payoutLine(toast.payout)}</span>
              : null}
            {toast.level ? <span className="receipt-level">Level {toast.level}.</span> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * The three methods a page needs: `show`, `say`, `clear`.
 *
 * Throws rather than no-opping when the host is missing: a receipt that
 * silently does not appear is a payout somebody was never told about, and that
 * is worse to debug than a crash on the first render in development.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs a <ToastHost> above it');
  return api;
}
