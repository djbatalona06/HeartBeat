import type { Env } from '../_lib';

/**
 * The Google half of optional account recovery.
 *
 * Everything structural lives in `_oauth.ts`, and everything this feature *is*
 * is stated in the banner of `_github.ts`: a second proof of "I am this
 * member", never a second way to become one. Only three things are Google's
 * own — where the browser goes, how a code becomes a stable user id, and which
 * table the links go in — and they are all that is below.
 *
 * Why a second provider: GitHub is a developer's account, and the two people
 * this app is for are not both developers. A recovery mechanism only one of
 * them can realistically use is half a recovery mechanism.
 */

/**
 * The two secrets. Optional in the type on purpose: a deploy that has never
 * configured them must still start and serve everything else, exactly as
 * `VAPID_PUBLIC_KEY` already does for push and `GITHUB_CLIENT_ID` for GitHub.
 * Every route reports their absence as "this is not set up here", never as a
 * failure.
 */
export interface GoogleEnv extends Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export interface GoogleApp {
  clientId: string;
  clientSecret: string;
}

/** Both or neither — a half-configured OAuth app fails at the token exchange,
 *  which is the least legible place for it to fail. */
export function googleApp(env: GoogleEnv): GoogleApp | null {
  const clientId = env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * `openid` and nothing else.
 *
 * This is the exact counterpart of GitHub's empty scope, and the reasoning is
 * the same: `openid` yields a stable `sub`, which identifies the account, which
 * is the entire purpose. Adding `email` or `profile` would hand this their
 * address, name and photograph, and a couples' mood tracker has no business
 * holding any of them. It is also what keeps the README's "no email addresses"
 * true with this feature switched on — there is no column for one because it is
 * never fetched.
 */
export const GOOGLE_SCOPE = 'openid';

export function authorizeUrl(app: GoogleApp, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: redirectUri,
    // Google requires this explicitly; GitHub infers it.
    response_type: 'code',
    state,
    scope: GOOGLE_SCOPE,
    // Forces the account chooser rather than silently reusing whichever Google
    // session the browser happens to hold — and a browser signed into several
    // at once is the ordinary case with Google, far more than with GitHub. On a
    // shared laptop, silently reusing one is how somebody recovers into the
    // wrong account.
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** The callback URL, derived from the request rather than configured. One
 *  fewer thing to set, and it cannot disagree with where the app is served. */
export function redirectUriFor(request: Request): string {
  return new URL('/api/auth/google/callback', request.url).toString();
}

export interface GoogleUser {
  /** The OpenID Connect `sub`: stable for this client, forever, and not the
   *  email address. See the note in migration 0015. */
  id: string;
}

/**
 * Trade the code for a token, then ask who it belongs to.
 *
 * Returns null rather than throwing on every failure path, because every
 * failure path here ends the same way — a redirect back to the app saying it
 * did not work — and there is nothing the caller could usefully distinguish.
 *
 * The token response also carries an `id_token`, a signed JWT with `sub` in it,
 * and reading that would save a round trip. It would also mean carrying an
 * RS256 verifier and a cache of Google's rotating JWKS, and getting either
 * wrong is a silent authentication bug rather than a loud one. The userinfo
 * endpoint answers the same question over a connection this code already
 * authenticated with its own client secret, so the extra fetch buys a great
 * deal of certainty for very little — and it mirrors how `_github.ts` asks.
 */
export async function identify(
  app: GoogleApp,
  code: string,
  redirectUri: string,
): Promise<GoogleUser | null> {
  // Form-encoded, not JSON: Google's token endpoint requires it, where
  // GitHub's accepts either.
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  }).catch(() => null);
  if (!tokenResponse?.ok) return null;

  const token = (await tokenResponse.json().catch(() => null)) as
    | { access_token?: string; error?: string }
    | null;
  if (!token?.access_token) return null;

  const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
  }).catch(() => null);
  if (!userResponse?.ok) return null;

  const user = (await userResponse.json().catch(() => null)) as { sub?: string } | null;
  if (!user?.sub) return null;
  return { id: user.sub };
}

/* -- the statements — see the banner in `_oauth.ts` for why they are hoisted -- */

/**
 * Connect a Google account to the member the bearer already proved.
 *
 * The `WHERE` on the conflict branch is the guard: a Google account already
 * connected to somebody else updates nothing, rather than being quietly moved.
 * A second Google account for a member already holding one is refused by the
 * unique index on `member_id` instead, which throws — two different failures,
 * both meaning "that is already taken".
 *
 * The conflict branch touches only `updated_at`, where GitHub's also refreshes
 * a login. There is nothing else here to refresh, which is the point.
 */
export const LINK_UPSERT_SQL =
  `INSERT INTO google_links (google_user_id, member_id, created_at, updated_at)
   VALUES (?, ?, ?, ?)
   ON CONFLICT (google_user_id) DO UPDATE SET
     updated_at = excluded.updated_at
   WHERE google_links.member_id = excluded.member_id`;

/**
 * Who a Google account recovers, if anyone.
 *
 * The join is load-bearing twice: an account nobody connected yields no row at
 * all, and a member whose device was revoked is excluded rather than
 * recovered — revocation has to mean something against this route too, or it
 * would be the way around it.
 */
export const RECOVER_LOOKUP_SQL =
  `SELECT l.member_id, m.couple_id
     FROM google_links l
     JOIN members m ON m.id = l.member_id
    WHERE l.google_user_id = ? AND m.revoked_at IS NULL`;
