import { authenticate, hashToken, json, newToken, recordAuthEvent } from '../../_lib';
import { CLAIM_CONSUME_SQL, sweep, type GitHubEnv } from '../_github';

/**
 * Exchange a one-time claim code for its result.
 *
 * This is where a recovery actually takes effect, and doing it here rather
 * than in the callback is deliberate. The obvious design has the callback
 * rotate the bearer and park it somewhere for the app to collect, which leaves
 * a live plaintext token at rest for the length of the claim window. Minting
 * it here means the new token is created, hashed into `members`, and returned
 * in a single response, and never exists anywhere at rest at all.
 *
 * The rotation is not incidental either — it is what recovery *is*. The member
 * row holds exactly one `token_hash`, so recovering onto a new phone
 * necessarily signs the old one out. That is the correct behaviour for the
 * case this exists for (a lost or replaced phone), and it is also the safety
 * property: if somebody else reaches this, the person it belongs to finds out
 * immediately, because their app stops working.
 */
export const onRequestPost: PagesFunction<GitHubEnv> = async ({ request, env }) => {
  const body = (await request.json().catch(() => ({}))) as { claim?: string };
  const code = (body.claim ?? '').trim();
  if (!code) return json({ error: 'claim required' }, 400);

  const now = Date.now();
  await sweep(env.DB, now);

  // Consumed by the read, for the same reason the state is: single-use has to
  // be enforced by the write, not by a check somebody can race.
  const claim = await env.DB.prepare(CLAIM_CONSUME_SQL)
    .bind(code, now)
    .first<{
      outcome: string;
      member_id: string | null;
      couple_id: string | null;
      github_login: string;
    }>();
  if (!claim) return json({ error: 'that link has expired' }, 410);

  if (claim.outcome === 'linked') {
    // Nothing to hand over. The device that started this is already signed in
    // — proving so here stops a stranger who intercepted the redirect from
    // learning even the connected login.
    const caller = await authenticate(request, env);
    if (!caller || caller.memberId !== claim.member_id) {
      return json({ error: 'sign in on this device first' }, 401);
    }
    return json({ outcome: 'linked', githubLogin: claim.github_login });
  }

  if (!claim.member_id || !claim.couple_id) return json({ error: 'that link has expired' }, 410);

  const token = newToken();
  const rotated = await env.DB.prepare(
    'UPDATE members SET token_hash = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL',
  )
    .bind(await hashToken(token), now, claim.member_id)
    .run();

  // Revoked between the callback and here. Rare, and the honest answer is that
  // this member is not recoverable rather than a token that authenticates
  // nothing.
  if (rotated.meta.changes !== 1) return json({ error: 'that member is no longer active' }, 409);

  await recordAuthEvent(
    env.DB, request,
    { kind: 'pair_join', coupleId: claim.couple_id, memberId: claim.member_id,
      detail: 'github-recovered' },
    now,
  );

  return json({
    outcome: 'recovered',
    memberId: claim.member_id,
    coupleId: claim.couple_id,
    token,
    githubLogin: claim.github_login,
  });
};
