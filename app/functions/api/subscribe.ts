import { authenticate, json, type Env } from './_lib';

/**
 * Where a phone says "deliver to me here".
 *
 * Mirrors the Worker's `/subscribe` against the same table and the same token
 * scheme, so a device that reaches the app over Pages does not have to know the
 * Worker's URL to turn notifications on. `entries.ts` mirrors the Worker for
 * the same reason.
 *
 * The endpoint is the primary key, and a re-subscribe upserts. Browsers hand
 * out a new endpoint whenever the old one is invalidated, so a phone that has
 * been reinstalled leaves a dead row behind — the Worker deletes those when a
 * delivery comes back 404 or 410, which is the only reliable signal there is.
 */

/** A push endpoint is a URL from the browser's own service, never our input. */
function looksLikeEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The keys are base64url and fixed-length; anything else is not a subscription. */
function looksLikeKey(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && /^[A-Za-z0-9_-]+=*$/.test(value);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: unknown; p256dh?: unknown; auth?: unknown;
  };

  if (!looksLikeEndpoint(body.endpoint)) return json({ error: 'endpoint is required' }, 400);
  if (!looksLikeKey(body.p256dh, 200)) return json({ error: 'p256dh is required' }, 400);
  if (!looksLikeKey(body.auth, 64)) return json({ error: 'auth is required' }, 400);

  const at = Date.now();
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, member_id, p256dh, auth, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       member_id = excluded.member_id, p256dh = excluded.p256dh,
       auth = excluded.auth, updated_at = excluded.updated_at`,
  ).bind(body.endpoint, caller.memberId, body.p256dh, body.auth, at, at).run();

  return json({ ok: true });
};

/**
 * Turning it off.
 *
 * Deletes by endpoint, scoped to the caller: a token can only ever unsubscribe
 * a device that is subscribed to its own member. Silent about whether the row
 * existed, because "it is off now" is true either way and the alternative
 * leaks which endpoints are registered.
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  if (!looksLikeEndpoint(body.endpoint)) return json({ error: 'endpoint is required' }, 400);

  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND member_id = ?')
    .bind(body.endpoint, caller.memberId)
    .run();

  return json({ ok: true });
};
