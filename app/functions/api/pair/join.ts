import { hashToken, json, newToken, recordAuthEvent, type Env } from '../_lib';

/**
 * Redeem an invite. The second device calls this and gets its own token.
 *
 * The admission check used to be `SELECT COUNT(*) FROM members` followed by an
 * insert, in two separate statements. That read is not part of the write's
 * transaction, so two devices redeeming two valid invites for the same couple
 * could both see one member and both insert — three people in a couple that is
 * two by definition, silently, with nothing logged anywhere.
 *
 * So the gate is now the write itself: every condition lives inside the INSERT,
 * where SQLite holds the write lock, and a losing racer changes no rows. The
 * reads below still run, but only to explain a refusal — they no longer decide
 * anything, so they cannot be raced into being wrong.
 *
 * The two statements are character-for-character identical to
 * worker/src/pairing.ts, which is tested against real SQLite (including this
 * exact race). worker/src/pairing.test.ts reads this file and fails if they
 * drift apart.
 */

const JOIN_INSERT_SQL = `INSERT INTO members (id, couple_id, token_hash, created_at, updated_at)
SELECT ?, i.couple_id, ?, ?, ?
  FROM invites i
 WHERE i.token = ?
   AND i.consumed_at IS NULL
   AND i.expires_at >= ?
   AND (SELECT COUNT(*) FROM members m
          WHERE m.couple_id = i.couple_id AND m.revoked_at IS NULL) < 2`;

const JOIN_CONSUME_SQL =
  'UPDATE invites SET consumed_at = ? WHERE token = ? AND consumed_at IS NULL';

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

  if (!row) {
    await recordAuthEvent(env.DB, request, { kind: 'join_refused', detail: 'no-such-invite' }, now);
    return json({ error: 'no such invite' }, 404);
  }
  const refuse = (detail: string, message: string, status: number) =>
    recordAuthEvent(env.DB, request, { kind: 'join_refused', coupleId: row.couple_id, detail }, now)
      .then(() => json({ error: message }, status));

  if (row.consumed_at) return refuse('already-used', 'invite already used', 409);
  if (row.expires_at < now) return refuse('expired', 'invite expired', 410);

  const existing = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM members WHERE couple_id = ? AND revoked_at IS NULL',
  )
    .bind(row.couple_id)
    .first<{ n: number }>();
  // Two people, by definition. A third join would silently widen who can read
  // the couple's data. Diagnostic only — the INSERT below enforces it.
  //
  // Revoked members do not count: revoke-then-repair is how a lost phone is
  // recovered, and counting them would make revocation brick the couple.
  if ((existing?.n ?? 0) >= 2) return refuse('couple-full', 'this couple is full', 409);

  const memberId = crypto.randomUUID();
  const token = newToken();
  const [inserted] = await env.DB.batch([
    env.DB.prepare(JOIN_INSERT_SQL).bind(memberId, await hashToken(token), now, now, code, now),
    env.DB.prepare(JOIN_CONSUME_SQL).bind(now, code),
  ]);

  // Everything above agreed this should work and the write disagreed. That is
  // the race, and the write is the one that is right.
  if (inserted.meta.changes !== 1) return refuse('raced', 'this couple is full', 409);

  await recordAuthEvent(
    env.DB,
    request,
    { kind: 'pair_join', coupleId: row.couple_id, memberId },
    now,
  );
  return json({ coupleId: row.couple_id, memberId, token });
};
