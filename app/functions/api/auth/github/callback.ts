import { recordAuthEvent } from '../../_lib';
import {
  CLAIM_INSERT_SQL, CLAIM_TTL_MS, LINK_UPSERT_SQL, RECOVER_LOOKUP_SQL, STATE_CONSUME_SQL,
  backToApp, githubApp, identify, randomKey, redirectUriFor, sweep,
  type GitHubEnv,
} from '../_github';

/**
 * Where GitHub sends the browser back to.
 *
 * Every failure ends the same way — a redirect into Settings carrying a short
 * reason — rather than as an error page, because the person doing this is on a
 * phone in a browser tab they did not choose to be in, and a stack trace is of
 * no use to them. The reasons are deliberately vague about *which* part failed
 * when the failure is somebody else's doing: "that sign-in did not work"
 * covers a replayed state and a forged one alike, and telling them apart is
 * only useful to whoever is trying.
 */
export const onRequestGet: PagesFunction<GitHubEnv> = async ({ request, env }) => {
  const app = githubApp(env);
  if (!app) return backToApp(request, { github: 'unconfigured' });

  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  // The person pressed "Cancel" on GitHub's own consent screen. Not a failure.
  if (url.searchParams.get('error')) return backToApp(request, { github: 'cancelled' });
  if (!code || !state) return backToApp(request, { github: 'failed' });

  const now = Date.now();
  await sweep(env.DB, now);

  // Consumed by the read: the DELETE is what makes the state single-use, so a
  // replayed callback finds nothing however fast it arrives.
  const pending = await env.DB.prepare(STATE_CONSUME_SQL)
    .bind(state, now, 'github')
    .first<{ intent: string; member_id: string | null }>();
  if (!pending) return backToApp(request, { github: 'failed' });

  const user = await identify(app, code, redirectUriFor(request));
  if (!user) return backToApp(request, { github: 'failed' });

  const claim = randomKey();
  const expires = now + CLAIM_TTL_MS;

  if (pending.intent === 'link') {
    if (!pending.member_id) return backToApp(request, { github: 'failed' });

    // The member is read back for its couple, and to prove it still exists —
    // a link started before the member was deleted must not resurrect a
    // foreign key to nothing.
    const member = await env.DB.prepare('SELECT couple_id FROM members WHERE id = ?')
      .bind(pending.member_id)
      .first<{ couple_id: string }>();
    if (!member) return backToApp(request, { github: 'failed' });

    // Two unique indexes can both reject this, and they mean different things,
    // so the failure is caught rather than left to 500: this GitHub account is
    // already linked to somebody else, or this member already has a different
    // account linked. Either way the honest answer is "that is already taken",
    // and unlinking first is the way through.
    try {
      await env.DB.prepare(LINK_UPSERT_SQL)
        .bind(user.id, pending.member_id, user.login, now, now)
        .run();
    } catch {
      return backToApp(request, { github: 'taken' });
    }

    // The ON CONFLICT above updates nothing when the row belongs to a
    // different member, so success has to be confirmed rather than assumed.
    const linked = await env.DB.prepare(
      'SELECT member_id FROM github_links WHERE github_user_id = ?',
    )
      .bind(user.id)
      .first<{ member_id: string }>();
    if (linked?.member_id !== pending.member_id) return backToApp(request, { github: 'taken' });

    await env.DB.prepare(CLAIM_INSERT_SQL)
      .bind(claim, 'linked', pending.member_id, member.couple_id, user.login, now, expires, 'github')
      .run();

    await recordAuthEvent(
      env.DB, request,
      { kind: 'pair_start', coupleId: member.couple_id, memberId: pending.member_id,
        detail: 'github-linked' },
      now,
    );
    return backToApp(request, { github: 'linked', claim });
  }

  // Recovery. The linked member is looked up by GitHub's id and nothing else;
  // an account nobody has linked gets no member, no couple, and no offer to
  // create one.
  const link = await env.DB.prepare(RECOVER_LOOKUP_SQL)
    .bind(user.id)
    .first<{ member_id: string; couple_id: string }>();

  if (!link) {
    await recordAuthEvent(
      env.DB, request, { kind: 'join_refused', detail: 'github-unlinked' }, now,
    );
    return backToApp(request, { github: 'unlinked' });
  }

  // No token is minted here, and none is stored. The claim carries an identity
  // and the rotation happens when it is exchanged — see the note on
  // `oauth_claims` in migration 0012.
  await env.DB.prepare(CLAIM_INSERT_SQL)
    .bind(claim, 'recovered', link.member_id, link.couple_id, user.login, now, expires, 'github')
    .run();

  return backToApp(request, { github: 'recovered', claim });
};
