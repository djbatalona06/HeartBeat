import { hapticFor, type HapticContext, type HapticKind } from '../domain/feedback/haptics';

/**
 * The one place this app asks a phone to buzz.
 *
 * Deliberately tiny. Everything that could be *wrong* — which kinds exist, how
 * long they run, and the three ways to decide on silence — is in
 * `domain/feedback/haptics.ts`, where vitest can reach it. This is the edge,
 * and `pwa/` is where edge code lives.
 */

/**
 * Whether this browser has the API at all.
 *
 * Read live rather than cached at module load: the check is free, and a cached
 * `false` taken during a service-worker boot is the kind of thing that is wrong
 * for the lifetime of the tab.
 */
export function supportsHaptics(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Buzz, or do nothing, and never throw either way.
 *
 * **Call this from inside a real tap handler and nowhere else.** iOS 18.4 is
 * reported to refuse a vibration outside a user gesture, and every use in this
 * app is already inside one — a task ticked, a cheer sent, an egg opened. An
 * `await` between the tap and here can spend the activation, so do the buzz
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
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw rather than returning false when the document is not
    // focused. Not worth a line of user-facing anything.
  }
}
