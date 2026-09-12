import { authenticate, json, recordAuthEvent } from '../../_lib';
import { googleApp, type GoogleEnv } from '../_google';

/**
 * What Settings shows, and the way back out.
 *
 * GET answers whether this deploy has Google sign-in at all, and whether the
 * calling device is connected. Both in one response, because the screen needs
 * both to decide between "not available here", "connect" and "connected".
 *
 * There is no account name in the answer, where GitHub's returns a login. The
 * `openid` scope does not reveal one, and adding a scope that did — purely so
 * Settings could print it — would be trading the couple's privacy for a caption.
 */
export const onRequestGet: PagesFunction<GoogleEnv> = async ({ request, env }) => {
  const configured = Boolean(googleApp(env));
  const caller = await authenticate(request, env);
  if (!caller) return json({ configured, linked: false });

  const row = await env.DB.prepare(
    'SELECT google_user_id FROM google_links WHERE member_id = ?',
  )
    .bind(caller.memberId)
    .first<{ google_user_id: string }>();

  return json({ configured, linked: Boolean(row) });
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
export const onRequestDelete: PagesFunction<GoogleEnv> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'sign in on this device first' }, 401);

  const now = Date.now();
  await env.DB.prepare('DELETE FROM google_links WHERE member_id = ?')
    .bind(caller.memberId)
    .run();

  await recordAuthEvent(
    env.DB, request,
    { kind: 'revoke', coupleId: caller.coupleId, memberId: caller.memberId,
      detail: 'google-unlinked' },
    now,
  );

  return json({ linked: false });
};
