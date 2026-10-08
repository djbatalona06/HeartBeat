/**
 * Whether to offer "keep your link safe" — the optional first sign-in with
 * Google or GitHub — and which providers to offer it with.
 *
 * Kept DOM-free so vitest can reach it (see vitest.config.ts: only `.ts`).
 *
 * The offer is for a phone that has *just* become part of a couple, because
 * that is the only moment a link can be made: connecting needs the bearer token
 * pairing mints, so there is nothing to connect on the very first launch. It
 * is shown once, and it is never in the way of the gates that come first.
 */

import type { AuthProvider, ProviderLink } from '../../pwa/api';

export type ProviderAnswers = Partial<Record<AuthProvider, ProviderLink | null>>;

export interface AccountPromptState {
  /** From `isPaired(settings)`. Nothing to connect to before this. */
  paired: boolean;
  /** Past first-run onboarding, so this never lands on top of it. */
  onboarded: boolean;
  /** Another one-time screen is already on (the naming gate). One at a time. */
  otherGateShowing: boolean;
  /** `settings.accountPromptSeenAt !== undefined`. */
  seen: boolean;
  /** What `/api/auth/<provider>/link` said, once it has said it. */
  providers: ProviderAnswers;
}

/** Providers this deploy has configured, in the order they are offered. */
export function configuredProviders(providers: ProviderAnswers): AuthProvider[] {
  return (['google', 'github'] as const).filter((p) => providers[p]?.configured);
}

export function showAccountPrompt(state: AccountPromptState): boolean {
  if (!state.paired || !state.onboarded || state.seen || state.otherGateShowing) return false;
  const offered = configuredProviders(state.providers);
  if (offered.length === 0) return false;
  // Already safe through one of them: the point of the offer is met.
  return !offered.some((p) => state.providers[p]?.linked);
}
