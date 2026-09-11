import { authenticate, json, recordAuthEvent } from '../../_lib';
import {
  STATE_TTL_MS, authorizeUrl, githubApp, randomKey, redirectUriFor, sweep, type GitHubEnv,
} from '../_github';

/**
 * Begin a GitHub sign-in. Answers with a URL for the app to send the browser
 * to; it never redirects itself, because the caller needs to know whether this
 * is even configured before it changes what is on screen.
 *
 * Two intents, and the difference is the whole security model:
 *
 *   - **link** requires a bearer token, and binds the state to the member that
 *     token already proves. This is the only way a link is ever created, which
 *     is what stops a GitHub sign-in from being a way *into* a couple.
 *   - **recover** requires nothing, and binds the state to no member at all.
 *     Which member it turns out to be is GitHub's answer at the callback, not
 *     something the caller gets to assert here.
 */
export const onRequestPost: PagesFunction<GitHubEnv> = async ({ request, env }) => {
  const app = githubApp(env);
  // Not an error. A deploy that never configured the OAuth app is a valid
  // deploy; the client hides the buttons on this answer. See /api/health.
  if (!app) return json({ error: 'github sign-in is not configured here' }, 503);

  const body = (await request.json().catch(() => ({}))) as { intent?: string };
  const intent = body.intent === 'recover' ? 'recover' : 'link';

  const now = Date.now();
  await sweep(env.DB, now);

  let memberId: string | null = null;
  if (intent === 'link') {
    const caller = await authenticate(request, env);
    if (!caller) return json({ error: 'sign in on this device first' }, 401);
    memberId = caller.memberId;
  }

  const state = randomKey();
  await env.DB.prepare(
    'INSERT INTO oauth_states (state, intent, member_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(state, intent, memberId, now, now + STATE_TTL_MS)
    .run();

  await recordAuthEvent(
    env.DB, request, { kind: 'pair_start', memberId, detail: `github-${intent}` }, now,
  );

  return json({ url: authorizeUrl(app, state, redirectUriFor(request)) });
};
