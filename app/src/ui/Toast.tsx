import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useTheme } from '../themes/ThemeProvider';
import { buzz } from '../pwa/haptics';
import { RECEIPT_MS, payoutLine, type ReceiptContent } from '../components/Receipt';

/**
 * One host for every receipt in the app.
 *
 * ## What this changes, and what it must not
 *
 * `components/Receipt.tsx` already consolidated five hand-rolled copies into
 * one hook and one component, and everything it decided stays decided here:
 * `RECEIPT_MS`, the structured `Payout` rather than a pre-formatted string, the
 * haptic defaulting to `success` with a payout and `levelUp` on a level, and
 * `role="status"` rather than `alert` because nothing here is urgent enough to
 * interrupt a screen reader mid-sentence.
 *
 * What changes is *where* it renders. Today each page holds its own `receipt`
 * state and renders its own `<Receipt>`, which means two pages can never show
 * one at the same time and none of them is announced from a stable live region.
 * This is one host, mounted once, with one `aria-live`.
 *
 * ## The contract that is easiest to break
 *
 * **`show` must be called from inside the tap**, before any `await`. Haptics
 * spend the user activation, and an `await` between the press and the buzz
 * spends it on nothing — the phone stays silent and the bug only appears on a
 * real device. `show` here is still synchronous and still fires `buzz` in the
 * same turn as the handler, exactly as `useReceipt` does. Anything that made
 * this async would pass every test and fail every phone.
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

  // The raw row rather than `loadSettings()`, for the reason `useReceipt` gives:
  // `loadSettings` merges defaults on every read, and calling it from a live
  // query triggers a sync rewrite that re-fires the query — see CLAUDE.md.
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
 * The replacement for `useReceipt`, with the same three methods.
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
