/**
 * Reading the redirect a sign-in provider sent the browser back with.
 *
 * Both `auth/github/callback.ts` and `auth/google/callback.ts` always end in a
 * redirect to `/#/settings?<provider>=…`, whatever happened, because the person
 * is standing in a browser tab they did not choose to be in and an error page
 * is no use to them. This turns that one parameter into something to say and
 * something to do.
 *
 * Pure, and separated from the component for the usual reason in this
 * repository: the mapping is a table, a table is exactly what rots when a new
 * outcome is added to a callback and forgotten here, and a table can be tested
 * where a component cannot.
 *
 * One table for both providers rather than two, because the outcomes are the
 * same seven and the sentences differ only in the name — and two copies is how
 * one of them ends up a release behind.
 */

/** The providers a deploy may offer. Each is also its own query parameter. */
export type RecoveryProvider = 'github' | 'google';

export const PROVIDER_NAMES: Record<RecoveryProvider, string> = {
  github: 'GitHub',
  google: 'Google',
};

/** Every value a callback can send. Anything else is treated as a failure. */
export type RecoveryOutcome =
  | 'linked'
  | 'recovered'
  | 'cancelled'
  | 'unlinked'
  | 'taken'
  | 'unconfigured'
  | 'failed';

const OUTCOMES: readonly RecoveryOutcome[] = [
  'linked', 'recovered', 'cancelled', 'unlinked', 'taken', 'unconfigured', 'failed',
];

export interface RecoveryReturn {
  provider: RecoveryProvider;
  outcome: RecoveryOutcome;
  /** Present only when there is something to exchange. */
  claim?: string;
  /** What to show. Written to be read by somebody who is not debugging this. */
  message: string;
  /** True when the message is bad news, so the screen can colour it. */
  problem: boolean;
}

const MESSAGES: Record<RecoveryOutcome, { message: (name: string) => string; problem: boolean }> = {
  linked: {
    message: (name) => `${name} connected. You can use it to get back in on a new phone.`,
    problem: false,
  },
  recovered: {
    message: () => 'Signed back in.',
    problem: false,
  },
  cancelled: {
    // Pressing Cancel on the provider's own consent screen is a decision, not a
    // bug, and should not be reported like one.
    message: () => 'No changes made.',
    problem: false,
  },
  unlinked: {
    message: (name) =>
      `That ${name} account is not connected to anything here. Connecting it has to be done `
      + `from a phone that is already signed in — which is what stops a ${name} account from `
      + 'being a way into somebody else’s couple.',
    problem: true,
  },
  taken: {
    message: (name) =>
      `That ${name} account is already connected to a different member, or this one already `
      + 'has another account connected. Disconnect first, then try again.',
    problem: true,
  },
  unconfigured: {
    message: (name) => `${name} sign-in is not set up on this deploy.`,
    problem: true,
  },
  failed: {
    message: () => 'That sign-in did not work. Starting again is the way through.',
    problem: true,
  },
};

/**
 * Nothing to say unless one of the parameters is actually there — every other
 * visit to Settings must render exactly as it did before.
 *
 * Only one provider can have sent the browser back, so the first parameter
 * found wins and there is no ordering question to get wrong.
 */
export function readRecoveryReturn(params: URLSearchParams): RecoveryReturn | null {
  for (const provider of Object.keys(PROVIDER_NAMES) as RecoveryProvider[]) {
    const raw = params.get(provider);
    if (!raw) continue;

    // An unrecognised value is a callback this build does not know about, which
    // is a failure from the reader's point of view however it looks from the
    // writer's.
    const outcome = (OUTCOMES as readonly string[]).includes(raw)
      ? (raw as RecoveryOutcome)
      : 'failed';

    const entry = MESSAGES[outcome];
    return {
      provider,
      outcome,
      claim: params.get('claim') ?? undefined,
      message: entry.message(PROVIDER_NAMES[provider]),
      problem: entry.problem,
    };
  }
  return null;
}

/**
 * Whether this return has something to exchange.
 *
 * Both outcomes that carry a claim code are worth exchanging — `recovered`
 * for the credentials, `linked` for the confirmation that the link actually
 * took — which is the only thing that proves it did.
 */
export function shouldClaim(
  result: RecoveryReturn | null,
): result is RecoveryReturn & { claim: string } {
  return Boolean(result?.claim) && (result?.outcome === 'recovered' || result?.outcome === 'linked');
}
