import { authenticate, hashToken, json, newToken, recordAuthEvent, type Env } from '../_lib';

/**
 * Minting, listing and revoking the study app's link.
 *
 * Called by Settings on a paired phone, so it authenticates as a member. What
 * it hands back is a *different* token, scoped to /api/study/session alone —
 * the study app is a separate origin with no accounts, and giving it a member's
 * bearer would give it the couple's whole record to do one thing with.
 *
 * The timezone is captured here rather than sent per request, because this is
 * the only moment anything server-side can know it: the member's phone is on
 * the call, and the study app has no idea whose day it is measuring.
 */

const MAX_ZONE = 64;

interface LinkRow {
  token_hash: string;
  time_zone: string;
  created_at: number;
  last_used_at: number | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const { results } = await env.DB.prepare(
    `SELECT token_hash, time_zone, created_at, last_used_at FROM study_tokens
      WHERE member_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
  )
    .bind(caller.memberId)
    .all<LinkRow>();

  return json({
    links: (results ?? []).map((row) => ({
      // The token itself is shown once, at mint. This is only enough to tell
      // two links apart and to say when one was last heard from.
      fingerprint: row.token_hash.slice(0, 8),
      timeZone: row.time_zone,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const body = (await request.json().catch(() => ({}))) as { timeZone?: unknown };
  const zone =
    typeof body.timeZone === 'string' && body.timeZone.length <= MAX_ZONE
      ? body.timeZone
      : 'UTC';

  const token = newToken();
  const now = Date.now();

  await env.DB.batch([
    // One live link per member: minting a new one retires the old, so a token
    // pasted into a study app on a phone that is gone stops working.
    env.DB.prepare(
      'UPDATE study_tokens SET revoked_at = ? WHERE member_id = ? AND revoked_at IS NULL',
    ).bind(now, caller.memberId),
    env.DB.prepare(
      `INSERT INTO study_tokens (token_hash, couple_id, member_id, time_zone, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(await hashToken(token), caller.coupleId, caller.memberId, zone, now),
  ]);

  // Returned exactly once. Nothing stores the plaintext, here or anywhere.
  return json({ token, timeZone: zone, createdAt: now });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const now = Date.now();
  const { meta } = await env.DB.prepare(
    'UPDATE study_tokens SET revoked_at = ? WHERE member_id = ? AND revoked_at IS NULL',
  )
    .bind(now, caller.memberId)
    .run();

  await recordAuthEvent(
    env.DB,
    request,
    { kind: 'revoke', coupleId: caller.coupleId, memberId: caller.memberId, detail: 'study link' },
    now,
  );

  return json({ ok: true, revoked: meta.changes });
};
