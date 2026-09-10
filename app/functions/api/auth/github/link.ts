import { authenticate, json, recordAuthEvent } from '../../_lib';
import { githubApp, type GitHubEnv } from '../_github';

/**
 * What Settings shows, and the way back out.
 *
 * GET answers whether this deploy has GitHub sign-in at all, and which account
 * the calling device is linked to. Both in one response, because the screen
 * needs both to decide between "not available here", "connect" and
 * "connected as".
 */
export const onRequestGet: PagesFunction<GitHubEnv> = async ({ request, env }) => {
  const configured = Boolean(githubApp(env));
  const caller = await authenticate(request, env);
  if (!caller) return json({ configured, linked: false });

  const row = await env.DB.prepare(
    'SELECT github_login FROM github_links WHERE member_id = ?',
  )
    .bind(caller.memberId)
    .first<{ github_login: string }>();

  return json({
    configured,
    linked: Boolean(row),
    githubLogin: row?.github_login ?? '',
  });
};

/**
 * Disconnect. Requires the bearer, so only the device that *is* the member can
 * do it — which also means a lost phone cannot be disconnected remotely by
 * whoever found it, and a recovered one can immediately re-link.
 *
 * Deliberately does not rotate the token. Unlinking removes a way back in; it
 * is not a "somebody is in my account" button, and pretending it is one would
 * sign the person out of the device they are standing there holding.
 */
export const onRequestDelete: PagesFunction<GitHubEnv> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'sign in on this device first' }, 401);

  const now = Date.now();
  await env.DB.prepare('DELETE FROM github_links WHERE member_id = ?')
    .bind(caller.memberId)
    .run();

  await recordAuthEvent(
    env.DB, request,
    { kind: 'revoke', coupleId: caller.coupleId, memberId: caller.memberId,
      detail: 'github-unlinked' },
    now,
  );

  return json({ linked: false });
};
