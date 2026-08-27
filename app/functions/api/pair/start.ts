import { INVITE_TTL_MS, hashToken, json, newInviteCode, newToken, type Env } from '../_lib';

/**
 * Open a couple and mint the first device's token.
 *
 * Ported from worker/src/index.ts so pairing works same-origin: the Worker owns
 * push and the boss cron and has to be deployed separately, and chat is useless
 * until two devices are paired. Both write the same rows to the same database.
 */
export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  const now = Date.now();
  const coupleId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const token = newToken();
  const invite = newInviteCode();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO couples (id, created_at) VALUES (?, ?)').bind(coupleId, now),
    env.DB.prepare(
      'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(memberId, coupleId, await hashToken(token), now, now),
    env.DB.prepare(
      'INSERT INTO invites (token, couple_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ).bind(invite, coupleId, now, now + INVITE_TTL_MS),
    env.DB.prepare('INSERT INTO pets (couple_id, fed_at) VALUES (?, ?)').bind(coupleId, now),
  ]);

  return json({ coupleId, memberId, token, invite, expiresAt: now + INVITE_TTL_MS });
};
