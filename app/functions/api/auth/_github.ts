import type { Env } from '../_lib';

/**
 * The GitHub half of optional account recovery.
 *
 * This is **not** a way into a couple. The six-character pairing code is still
 * the only thing that makes two phones a couple, and nothing here creates a
 * member, a couple, or an invite. What it adds is a second proof of "I am this
 * member", for the case the app had no answer to: a phone is lost or replaced,
 * and the single-use invite that put it in the couple was consumed months ago.
 * Recovery was previously only possible via the *other* partner — which meant
 * it was impossible for whoever was holding the only phone.
 *
 * Two consequences follow from that framing and are enforced everywhere below:
 *
 *   1. A link is only ever created by a device already authenticated as the
 *      member being linked. Signing in with a GitHub account nobody has linked
 *      gets you nothing at all — not an account, not an empty couple, not a
 *      prompt to make one.
 *   2. Recovery returns exactly the member that was linked, and never chooses
 *      one. Which member it is, is GitHub's answer, not the caller's claim.
 */

/**
 * The two secrets. Optional in the type on purpose: a deploy that has never
 * configured them must still start and serve everything else, exactly as
 * `VAPID_PUBLIC_KEY` already does for push. Every route below reports their
 * absence as "this is not set up here", never as a failure.
 */
export interface GitHubEnv extends Env {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

export interface GitHubApp {
  clientId: string;
  clientSecret: string;
}

/** Both or neither — a half-configured OAuth app fails at the token exchange,
 *  which is the least legible place for it to fail. */
export function githubApp(env: GitHubEnv): GitHubApp | null {
  const clientId = env.GITHUB_CLIENT_ID ?? '';
  const clientSecret = env.GITHUB_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/* The single-use state, the one-time claim, the sweep and the way back into the
 * app are the same shape for both providers and now live in `_oauth.ts`.
 * Re-exported here so every route and test that already imported them from this
 * module keeps working, and so this file stays the place to read about what
 * GitHub recovery *is*. */
export {
  CLAIM_CONSUME_SQL, CLAIM_INSERT_SQL, CLAIM_TTL_MS, STATE_CONSUME_SQL, STATE_INSERT_SQL,
  STATE_TTL_MS, backToApp, randomKey, sweep,
} from './_oauth';

/**
 * The scope asked for is deliberately empty.
 *
 * An empty scope still identifies the user — `GET /user` returns the account's
 * id and login on a bare token — and identifying the user is the entire
 * purpose. Asking for `read:user` would let this read their profile, and
 * asking for anything with `repo` in it would let it read their code. A
 * recovery mechanism for a couples' mood tracker has no business holding
 * either, and the consent screen should say so.
 */
export const GITHUB_SCOPE = '';

export function authorizeUrl(app: GitHubApp, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: redirectUri,
    state,
    scope: GITHUB_SCOPE,
    // Forces the account chooser rather than silently reusing whichever GitHub
    // session the browser happens to hold. On a shared laptop, silently
    // reusing it is how somebody recovers into the wrong account.
    prompt: 'select_account',
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/** The callback URL, derived from the request rather than configured. One
 *  fewer thing to set, and it cannot disagree with where the app is served. */
export function redirectUriFor(request: Request): string {
  return new URL('/api/auth/github/callback', request.url).toString();
}

export interface GitHubUser {
  /** GitHub's numeric id, as a string. Stable across a rename; a login is not. */
  id: string;
  login: string;
}

/**
 * Trade the code for a token, then ask who it belongs to.
 *
 * Returns null rather than throwing on every failure path, because every
 * failure path here ends the same way — a redirect back to the app saying it
 * did not work — and there is nothing the caller could usefully distinguish.
 * GitHub also answers a *bad code* with HTTP 200 and an `error` field in the
 * body, so status alone is not the check.
 */
export async function identify(
  app: GitHubApp,
  code: string,
  redirectUri: string,
): Promise<GitHubUser | null> {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  }).catch(() => null);
  if (!tokenResponse?.ok) return null;

  const token = (await tokenResponse.json().catch(() => null)) as
    | { access_token?: string; error?: string }
    | null;
  if (!token?.access_token) return null;

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: 'application/vnd.github+json',
      // GitHub rejects an API request with no user agent.
      'user-agent': 'heartbeat-app',
    },
  }).catch(() => null);
  if (!userResponse?.ok) return null;

  const user = (await userResponse.json().catch(() => null)) as
    | { id?: number; login?: string }
    | null;
  if (typeof user?.id !== 'number') return null;
  return { id: String(user.id), login: user.login ?? '' };
}

/* -- the statements — see the banner in `_oauth.ts` for why they are hoisted -- */

/**
 * Connect a GitHub account to the member the bearer already proved.
 *
 * The `WHERE` on the conflict branch is the guard: a GitHub account already
 * connected to somebody else updates nothing, rather than being quietly moved.
 * A second GitHub account for a member already holding one is refused by the
 * unique index on `member_id` instead, which throws — two different failures,
 * both meaning "that is already taken".
 */
export const LINK_UPSERT_SQL =
  `INSERT INTO github_links (github_user_id, member_id, github_login, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT (github_user_id) DO UPDATE SET
     github_login = excluded.github_login,
     updated_at   = excluded.updated_at
   WHERE github_links.member_id = excluded.member_id`;

/**
 * Who a GitHub account recovers, if anyone.
 *
 * The join is load-bearing twice: an account nobody connected yields no row at
 * all, and a member whose device was revoked is excluded rather than
 * recovered — revocation has to mean something against this route too, or it
 * would be the way around it.
 */
export const RECOVER_LOOKUP_SQL =
  `SELECT l.member_id, m.couple_id
     FROM github_links l
     JOIN members m ON m.id = l.member_id
    WHERE l.github_user_id = ? AND m.revoked_at IS NULL`;
