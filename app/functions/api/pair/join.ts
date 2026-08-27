import { hashToken, json, newToken, type Env } from '../_lib';

/** Redeem an invite. The second device calls this and gets its own token. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json().catch(() => ({}))) as { invite?: string };
  const code = (body.invite ?? '').trim().toUpperCase();
  if (!code) return json({ error: 'invite required' }, 400);

  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT couple_id, expires_at, consumed_at FROM invites WHERE token = ?',
  )
    .bind(code)
    .first<{ couple_id: string; expires_at: number; consumed_at: number | null }>();

  if (!row) return json({ error: 'no such invite' }, 404);
  if (row.consumed_at) return json({ error: 'invite already used' }, 409);
  if (row.expires_at < now) return json({ error: 'invite expired' }, 410);

  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE couple_id = ?')
    .bind(row.couple_id)
    .first<{ n: number }>();
  // Two people, by definition. A third join would silently widen who can read
  // the couple's data.
  if ((existing?.n ?? 0) >= 2) return json({ error: 'this couple is full' }, 409);

  const memberId = crypto.randomUUID();
  const token = newToken();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(memberId, row.couple_id, await hashToken(token), now, now),
    env.DB.prepare('UPDATE invites SET consumed_at = ? WHERE token = ?').bind(now, code),
  ]);

  return json({ coupleId: row.couple_id, memberId, token });
};
