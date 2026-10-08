import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useTheme } from '../themes/ThemeProvider';
import {
  hapticFor, tickOffsets, type HapticContext, type HapticKind,
} from '../domain/feedback/haptics';

/**
 * The one place this app asks a phone to buzz.
 *
 * Deliberately tiny. Everything that could be *wrong* — which kinds exist, how
 * long they run, and the three ways to decide on silence — is in
 * `domain/feedback/haptics.ts`, where vitest can reach it. This is the edge,
 * and `pwa/` is where edge code lives.
 *
 * Two motors, one call. Android has `navigator.vibrate`. iPhone does not, but
 * Safari 17.4+ ticks the Taptic Engine when an `<input switch>` is toggled from
 * a tap, so on iOS a hidden one is flipped through its label instead.
 */

const vibrates = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Safari exposes the `switch` attribute as a property; nothing else does. */
const switches = () => typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;

/**
 * Whether this browser can buzz at all.
 *
 * Read live rather than cached at module load: the check is free, and a cached
 * `false` taken during a service-worker boot is the kind of thing that is wrong
 * for the lifetime of the tab.
 */
export function supportsHaptics(): boolean {
  return vibrates() || switches();
}

let label: HTMLLabelElement | null = null;

/** One hidden switch for the whole app, made on first use. */
function tickLabel(): HTMLLabelElement {
  if (label?.isConnected) return label;
  label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.append(input);
  document.body.append(label);
  return label;
}

/**
 * Buzz, or do nothing, and never throw either way.
 *
 * **Call this from inside a real tap handler and nowhere else.** iOS refuses a
 * vibration, and the switch's tick, outside a user gesture, and every use in
 * this app is already inside one — a task ticked, a cheer sent, a tab changed.
 * An `await` between the tap and here can spend the activation, so do the buzz
 * first and the async work after.
 *
 * A failure is swallowed on purpose. The worst outcome of a missing buzz is a
 * missing buzz; the worst outcome of letting this throw is a completion handler
 * that does not finish the task.
 */
export function buzz(kind: HapticKind, at: Omit<HapticContext, 'supported'>): void {
  const pattern = hapticFor(kind, { ...at, supported: supportsHaptics() });
  if (!pattern) return;
  try {
    if (vibrates()) {
      navigator.vibrate(pattern);
      return;
    }
    const target = tickLabel();
    for (const ms of tickOffsets(pattern)) {
      if (ms === 0) target.click();
      else window.setTimeout(() => target.click(), ms);
    }
  } catch {
    // Some browsers throw rather than returning false when the document is not
    // focused. Not worth a line of user-facing anything.
  }
}

/**
 * `buzz` with calm and the Settings toggle already read, for a component that
 * only wants to say "tap".
 *
 * The raw settings row, not `loadSettings()`: that would rewrite the row from
 * inside a live query, which CLAUDE.md records re-firing it twenty times.
 */
export function useBuzz(): (kind: HapticKind) => void {
  const { calm } = useTheme();
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const enabled = settings?.haptics !== false;
  return useCallback((kind: HapticKind) => buzz(kind, { calm, enabled }), [calm, enabled]);
}
