/**
 * When the phone should buzz, and for how long.
 *
 * Split from the call itself for the usual reason in this repository: the rule
 * worth protecting is *whether* to buzz, not how to ask the browser to. That
 * rule is three booleans and a table, vitest can reach it in a `node`
 * environment with no `navigator` anywhere, and the one thing that must never
 * regress — **calm mode means silence, including in your pocket** — is a line
 * in a pure function with a test on it rather than a condition somebody has to
 * remember to write at four call sites.
 *
 * `pwa/haptics.ts` does the asking. It is four lines, because everything that
 * could be wrong is here.
 *
 * ### On iOS, which is the platform this app is actually for
 *
 * The Vibration API's status on iOS Safari is, as of this writing, genuinely
 * unsettled: MDN says Safari never shipped it and caniuse lists Safari as the
 * last holdout, while a browser-compat issue filed in March 2026 reports it
 * working on iOS with nobody sure which version added it. iOS 18.4 is reported
 * to require a user gesture before a vibration will fire at all.
 *
 * So this is written to be correct under every one of those readings rather
 * than to bet on one:
 *
 * - The caller feature-detects and this returns a pattern regardless; a phone
 *   that cannot buzz simply never asks. Nothing is lost on a device without it,
 *   and nothing anywhere says "your phone should have buzzed".
 * - Every call site is already inside a real tap — finishing a task, sending a
 *   cheer, opening an egg — so the gesture requirement costs nothing. Do not
 *   add one that is not.
 *
 * No polyfill. The known one hooks `AudioContext` to fake it, this repository
 * bundles nothing third-party (`NOTICE.md` exists to say so), and uncertain iOS
 * support is a bad thing to buy with a dependency.
 */

/**
 * Four, and no more.
 *
 * The brief asked for "standardised haptic profiles", and the failure mode of
 * that request is fourteen of them: a vocabulary nobody can tell apart through
 * a trouser pocket is not a vocabulary, it is noise with a type signature.
 * These four are distinguishable by *length and count*, which is the only thing
 * a phone motor can actually express — a single short pulse, a double, a longer
 * flourish, and one heavy buzz that reads as a stop.
 *
 * Numbers are milliseconds, alternating vibrate/pause per the Vibration API.
 * Nothing here totals more than a quarter of a second; a buzz you notice ending
 * is already too long.
 */
export const HAPTIC_PATTERNS = {
  /** A tap landed. The lightest thing the motor can say. */
  tap: [10],
  /** Something was earned — a task ticked, a cheer sent. */
  success: [12, 40, 24],
  /** Bigger: a level, a tier, a finished week. */
  levelUp: [16, 50, 16, 50, 40],
  /** Refused, or already done. Heavier and single, so it does not read as a reward. */
  error: [40, 60, 40],
} as const;

export type HapticKind = keyof typeof HAPTIC_PATTERNS;

export const HAPTIC_KINDS = Object.keys(HAPTIC_PATTERNS) as HapticKind[];

/** The longest any single pattern may run, summed. A guard rather than a
 *  preference: the test asserts it, so a future "celebration" pattern cannot
 *  quietly become a phone that will not stop. */
export const MAX_PATTERN_MS = 250;

export interface HapticContext {
  /** `calmMode || prefers-reduced-motion`, straight off `useTheme()`. */
  calm: boolean;
  /** The Settings toggle. On unless somebody turned it off. */
  enabled: boolean;
  /** `'vibrate' in navigator`, resolved by the caller. */
  supported: boolean;
}

/**
 * The pattern to play, or `null` for silence.
 *
 * Three ways to get `null`, and the order does not matter because all three are
 * absolute:
 *
 * **Calm mode.** This is the one that matters and the one most likely to be
 * lost in a refactor. Calm is already `calmMode || prefers-reduced-motion`, and
 * somebody who asked the app to stop moving did not mean "except in my pocket".
 * Reduced motion is an accessibility setting before it is a taste, and for some
 * people it is a vestibular one; a buzz is motion.
 *
 * **The toggle.** Its own setting, because a person can want the animations and
 * not the buzzing.
 *
 * **No support.** Every browser that is not Safari, and possibly Safari — see
 * the banner. A device that cannot do this is not a degraded device.
 */
export function hapticFor(kind: HapticKind, at: HapticContext): number[] | null {
  if (at.calm || !at.enabled || !at.supported) return null;
  const pattern = HAPTIC_PATTERNS[kind];
  return pattern ? [...pattern] : null;
}
