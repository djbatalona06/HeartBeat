/**
 * Reading the redirect GitHub sent the browser back with.
 *
 * `app/functions/api/auth/github/callback.ts` always ends in a redirect to
 * `/#/settings?github=…`, whatever happened, because the person is standing in
 * a browser tab they did not choose to be in and an error page is no use to
 * them. This turns that one parameter into something to say and something to
 * do.
 *
 * Pure, and separated from the component for the usual reason in this
 * repository: the mapping is a table, a table is exactly what rots when a new
 * outcome is added to the callback and forgotten here, and a table can be
 * tested where a component cannot.
 */

/** Every value the callback can send. Anything else is treated as a failure. */
export type GitHubOutcome =
  | 'linked'
  | 'recovered'
  | 'cancelled'
  | 'unlinked'
  | 'taken'
  | 'unconfigured'
  | 'failed';

const OUTCOMES: readonly GitHubOutcome[] = [
  'linked', 'recovered', 'cancelled', 'unlinked', 'taken', 'unconfigured', 'failed',
];

export interface GitHubReturn {
  outcome: GitHubOutcome;
  /** Present only when there is something to exchange. */
  claim?: string;
  /** What to show. Written to be read by somebody who is not debugging this. */
  message: string;
  /** True when the message is bad news, so the screen can colour it. */
  problem: boolean;
}

const MESSAGES: Record<GitHubOutcome, { message: string; problem: boolean }> = {
  linked: {
    message: 'GitHub connected. You can use it to get back in on a new phone.',
    problem: false,
  },
  recovered: {
    message: 'Signed back in.',
    problem: false,
  },
  cancelled: {
    // Pressing Cancel on GitHub's own consent screen is a decision, not a bug,
    // and should not be reported like one.
    message: 'No changes made.',
    problem: false,
  },
  unlinked: {
    message:
      'That GitHub account is not connected to anything here. Connecting it has to be done '
      + 'from a phone that is already signed in — which is what stops a GitHub account from '
      + 'being a way into somebody else’s couple.',
    problem: true,
  },
  taken: {
    message:
      'That GitHub account is already connected to a different member, or this one already '
      + 'has another account connected. Disconnect first, then try again.',
    problem: true,
  },
  unconfigured: {
    message: 'GitHub sign-in is not set up on this deploy.',
    problem: true,
  },
  failed: {
    message: 'That sign-in did not work. Starting again is the way through.',
    problem: true,
  },
};

/**
 * Nothing to say unless the parameter is actually there — every other visit to
 * Settings must render exactly as it did before.
 */
export function readGitHubReturn(params: URLSearchParams): GitHubReturn | null {
  const raw = params.get('github');
  if (!raw) return null;

  // An unrecognised value is a callback this build does not know about, which
  // is a failure from the reader's point of view however it looks from the
  // writer's.
  const outcome = (OUTCOMES as readonly string[]).includes(raw)
    ? (raw as GitHubOutcome)
    : 'failed';

  const claim = params.get('claim') ?? undefined;
  return { outcome, claim, ...MESSAGES[outcome] };
}

/**
 * Whether this return has something to exchange.
 *
 * Both outcomes that carry a claim code are worth exchanging — `recovered`
 * for the credentials, `linked` for the connected login, which is the only
 * confirmation that the link actually took.
 */
export function shouldClaim(result: GitHubReturn | null): result is GitHubReturn & { claim: string } {
  return Boolean(result?.claim) && (result?.outcome === 'recovered' || result?.outcome === 'linked');
}
