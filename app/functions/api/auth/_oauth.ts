/**
 * What the two sign-in providers have in common, which is nearly all of it.
 *
 * GitHub came first and this was carved out of it when Google arrived; see the
 * banner in `_github.ts` for the full argument about what account recovery is
 * and — more importantly — what it deliberately is not. In one line: this is a
 * second proof of *"I am this member"*, and never a second way to become one.
 *
 * What is provider-specific is small and lives in `_github.ts` and
 * `_google.ts`: where to send the browser, how to turn a code into a stable
 * user id, and which table the links go in. Everything below — the single-use
 * expiring state, the one-time claim with nowhere to put a token, the
 * opportunistic sweep, the way back into the app — is the same shape for both,
 * and a second copy of it would be a second place for an auth bug to live.
 */

/** Every provider this deploy knows how to talk to. */
export type Provider = 'github' | 'google';

/** How long a started sign-in stays valid. Long enough to authorise on a slow
 *  phone, short enough that an abandoned one is not lying around. */
export const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * How long the app has to exchange a claim code. Deliberately tiny: the code
 * is in a URL the browser has just been redirected to, so it is in history,
 * and the only thing standing between that and a stranger is how quickly it
 * stops working.
 */
export const CLAIM_TTL_MS = 60 * 1000;

export function randomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Expired rows, cleared opportunistically.
 *
 * There is no cron here and adding one for two small tables would be more
 * moving parts than the problem deserves. Every sign-in sweeps, which is often
 * enough that the tables stay small and cheap enough that nobody waits on it.
 */
export async function sweep(db: D1Database, now: number): Promise<void> {
  try {
    await db.batch([
      db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(now),
      db.prepare('DELETE FROM oauth_claims WHERE expires_at < ?').bind(now),
    ]);
  } catch (error) {
    // A failed sweep is a slightly larger table, not a failed sign-in.
    console.error('oauth sweep failed', error);
  }
}

/**
 * Back to the app, with a result the SPA can read.
 *
 * The app is a hash router, so everything after `#` is the client's business
 * and never reaches a server — which is also why the claim code goes here
 * rather than in a query string that would be sent to the origin on every
 * subsequent navigation.
 */
export function backToApp(request: Request, params: Record<string, string>): Response {
  const app = new URL('/', request.url);
  app.hash = `/settings?${new URLSearchParams(params)}`;
  return Response.redirect(app.toString(), 302);
}

/* -- the statements, hoisted so they can be run against real SQLite -----------
 * Every security property this feature has is a WHERE clause, and none of them
 * is visible from the outside: a refused write and a write that happened to
 * change nothing look identical to the caller, so a bug in any of them is
 * silent by construction. `worker/src/githubAuth.test.ts` and
 * `googleAuth.test.ts` apply the real migrations and run these exact strings —
 * the same arrangement `pairing.test.ts` uses for the join race and
 * `holdings.test.ts` for the ownership guard, and for the same stated reason:
 * a hand-written fake returns whatever the test wants and proves nothing about
 * what the database does.
 */

/**
 * Consumed by the read. Single-use has to be enforced by the write and not by
 * a check somebody can race, so a replayed callback finds nothing however fast
 * it arrives — which is the entire job of the `state` parameter.
 *
 * Scoped to the provider that minted it, so one provider's callback cannot
 * consume the other's state. Both take the provider as the last bind rather
 * than baking it into the string, so there is one statement to get right.
 */
export const STATE_CONSUME_SQL =
  `DELETE FROM oauth_states
    WHERE state = ? AND expires_at >= ? AND provider = ?
    RETURNING intent, member_id`;

/** The same, for the code the redirect came back with. `handle` is whatever the
 *  provider is willing to show in Settings — a GitHub login, or '' for Google,
 *  which is asked for no scope that would reveal one. */
export const CLAIM_CONSUME_SQL =
  `DELETE FROM oauth_claims
    WHERE code = ? AND expires_at >= ? AND provider = ?
    RETURNING outcome, member_id, couple_id, github_login AS handle`;

export const STATE_INSERT_SQL =
  `INSERT INTO oauth_states (state, intent, member_id, created_at, expires_at, provider)
   VALUES (?, ?, ?, ?, ?, ?)`;

export const CLAIM_INSERT_SQL =
  `INSERT INTO oauth_claims
     (code, outcome, member_id, couple_id, github_login, created_at, expires_at, provider)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
