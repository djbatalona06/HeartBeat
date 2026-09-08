import { json, type Env } from './_lib';

/**
 * Is the backend actually wired up?
 *
 * Booleans, and one public key. This exists so that "chat isn't working" can be
 * answered in one tap instead of by guessing which of the bindings the deploy
 * forgot.
 *
 * The VAPID public key is the one piece of key material that belongs in a
 * response like this: it is what the browser must pass to `pushManager.subscribe`
 * as the application server key, so it reaches every client that ever enables
 * notifications and is public by construction. The private half stays a Worker
 * secret and is not in `Env` here at all. Its absence is reported as `push:
 * false` rather than as an error, so a deploy without push configured still
 * answers this route.
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let db = false;
  try {
    await env.DB.prepare('SELECT 1').first();
    db = true;
  } catch {
    db = false;
  }
  const vapidPublicKey = env.VAPID_PUBLIC_KEY ?? null;
  return json({
    ok: db && Boolean(env.AI),
    db,
    ai: Boolean(env.AI),
    push: Boolean(vapidPublicKey),
    vapidPublicKey,
  });
};
