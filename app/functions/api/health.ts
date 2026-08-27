import { json, type Env } from './_lib';

/**
 * Is the backend actually wired up?
 *
 * Booleans only — never key material, never a database id. This exists so that
 * "chat isn't working" can be answered in one tap instead of by guessing which
 * of the bindings the deploy forgot.
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let db = false;
  try {
    await env.DB.prepare('SELECT 1').first();
    db = true;
  } catch {
    db = false;
  }
  return json({ ok: db && Boolean(env.AI), db, ai: Boolean(env.AI) });
};
