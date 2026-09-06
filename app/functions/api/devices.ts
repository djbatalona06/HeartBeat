import { authenticate, json, type Env } from './_lib';

/**
 * The paired devices, and turning one off.
 *
 * Pairing used to be a one-way door: a device that redeemed an invite held a
 * working bearer forever, and a phone that was lost or sold stayed paired with
 * no way to say otherwise short of editing D1 by hand.
 *
 * GET lists the couple's members with enough to tell them apart. POST revokes
 * one. Tokens are stored hashed and are never returned by either — the list is
 * for recognising a device, not for reissuing its credentials.
 */

interface DeviceRow {
  id: string;
  display_name: string;
  created_at: number;
  revoked_at: number | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const { results } = await env.DB.prepare(
    `SELECT id, display_name, created_at, revoked_at
       FROM members WHERE couple_id = ? ORDER BY created_at`,
  )
    .bind(caller.coupleId)
    .all<DeviceRow>();

  return json({
    devices: (results ?? []).map((row) => ({
      memberId: row.id,
      displayName: row.display_name,
      joinedAt: row.created_at,
      revokedAt: row.revoked_at,
      /** So the screen can say "this phone" rather than making someone guess. */
      isYou: row.id === caller.memberId,
    })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const body = (await request.json().catch(() => ({}))) as { memberId?: string };
  const target = (body.memberId ?? '').trim();
  if (!target) return json({ error: 'memberId required' }, 400);

  const now = Date.now();
  // Scoped to the caller's own couple, so a token cannot be used to revoke a
  // stranger's device even if a member id from another couple is guessed.
  const { meta } = await env.DB.prepare(
    'UPDATE members SET revoked_at = ?, updated_at = ? WHERE id = ? AND couple_id = ? AND revoked_at IS NULL',
  )
    .bind(now, now, target, caller.coupleId)
    .run();

  if (meta.changes !== 1) return json({ error: 'no such device, or already revoked' }, 404);

  await env.DB.prepare(
    `INSERT INTO auth_events (id, couple_id, member_id, kind, detail, country, ua_hash, at)
     VALUES (?, ?, ?, 'revoke', ?, ?, '', ?)`,
  )
    .bind(
      crypto.randomUUID(),
      caller.coupleId,
      target,
      target === caller.memberId ? 'revoked itself' : 'revoked by partner',
      request.headers.get('cf-ipcountry') ?? '',
      now,
    )
    .run();

  return json({ ok: true, revokedAt: now });
};
