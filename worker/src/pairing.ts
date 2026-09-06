/**
 * Redeeming an invite, without a window where a third device can get in.
 *
 * The old shape read `SELECT COUNT(*) FROM members` and *then* inserted, in a
 * separate statement. That read is not part of the write's transaction, so two
 * devices redeeming two valid invites for the same couple could both see one
 * member, and both insert — three people in a couple that is two by definition,
 * silently, with no error anywhere. The invite TTL made it unlikely; it did not
 * make it impossible, and "unlikely" is not what you want standing between a
 * stranger and someone's mood log.
 *
 * So the gate is the write. Every condition that decides whether this device
 * may join — the invite exists, is unconsumed, is unexpired, and the couple has
 * room — is evaluated inside the INSERT itself, where SQLite holds the write
 * lock. A losing racer writes nothing and sees `changes === 0`.
 *
 * The plain SELECT is still here, but only to say *why* a refusal happened. It
 * no longer decides anything, so it cannot be raced into being wrong.
 *
 * A revoked member does not occupy a seat. That is what makes losing a phone
 * recoverable: revoke it, and the replacement can pair into the freed slot.
 * Counting revoked rows would have made revocation brick the couple, since the
 * row is kept rather than deleted so the person's history survives. Freeing the
 * seat is not a way in — revoking requires an authenticated token to begin with.
 */

/** Two people, by definition. */
export const COUPLE_SIZE = 2;

/**
 * The whole admission check, as one atomic statement.
 *
 * Binds, in order: memberId, tokenHash, now, now, inviteCode, now.
 * `couple_id` is taken from the invite row rather than bound, so the member can
 * only ever land in the couple the invite actually belongs to.
 *
 * Kept character-for-character identical to the copy in
 * app/functions/api/pair/join.ts — pairing.test.ts fails if they drift.
 */
export const JOIN_INSERT_SQL = `INSERT INTO members (id, couple_id, token_hash, created_at, updated_at)
SELECT ?, i.couple_id, ?, ?, ?
  FROM invites i
 WHERE i.token = ?
   AND i.consumed_at IS NULL
   AND i.expires_at >= ?
   AND (SELECT COUNT(*) FROM members m
          WHERE m.couple_id = i.couple_id AND m.revoked_at IS NULL) < 2`;

/**
 * Single-use, enforced by the same statement that reads it. `AND consumed_at IS
 * NULL` is what makes a second concurrent redemption of one invite a no-op
 * rather than a second consume.
 *
 * Kept identical to app/functions/api/pair/join.ts — see above.
 */
export const JOIN_CONSUME_SQL =
  'UPDATE invites SET consumed_at = ? WHERE token = ? AND consumed_at IS NULL';

/** Why a join was refused, for a message the person can act on. */
export type JoinRefusal = 'no-such-invite' | 'already-used' | 'expired' | 'couple-full' | 'raced';

export interface JoinOutcome {
  ok: boolean;
  refusal?: JoinRefusal;
  coupleId?: string;
}

/** The subset of D1 this needs, so a test can hand it a real SQLite instead. */
export interface JoinDb {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
  batch(
    statements: ReturnType<ReturnType<JoinDb['prepare']>['bind']>[],
  ): Promise<{ meta: { changes: number } }[]>;
}

export const REFUSAL_STATUS: Record<JoinRefusal, number> = {
  'no-such-invite': 404,
  'already-used': 409,
  expired: 410,
  'couple-full': 409,
  // Lost a race that the diagnostic read could not see. Conflict, not a fault.
  raced: 409,
};

export const REFUSAL_MESSAGE: Record<JoinRefusal, string> = {
  'no-such-invite': 'no such invite',
  'already-used': 'invite already used',
  expired: 'invite expired',
  'couple-full': 'this couple is full',
  raced: 'this couple is full',
};

export async function joinCouple(
  db: JoinDb,
  code: string,
  memberId: string,
  tokenHash: string,
  now: number,
): Promise<JoinOutcome> {
  const invite = await db
    .prepare('SELECT couple_id, expires_at, consumed_at FROM invites WHERE token = ?')
    .bind(code)
    .first<{ couple_id: string; expires_at: number; consumed_at: number | null }>();

  if (!invite) return { ok: false, refusal: 'no-such-invite' };
  // The couple is carried on refusals too: a turned-away device is the event
  // most worth being able to attribute, and it has no member row to point at.
  if (invite.consumed_at) return { ok: false, refusal: 'already-used', coupleId: invite.couple_id };
  if (invite.expires_at < now) return { ok: false, refusal: 'expired', coupleId: invite.couple_id };

  const seated = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE couple_id = ? AND revoked_at IS NULL')
    .bind(invite.couple_id)
    .first<{ n: number }>();
  if ((seated?.n ?? 0) >= COUPLE_SIZE) {
    return { ok: false, refusal: 'couple-full', coupleId: invite.couple_id };
  }

  const [inserted] = await db.batch([
    db.prepare(JOIN_INSERT_SQL).bind(memberId, tokenHash, now, now, code, now),
    db.prepare(JOIN_CONSUME_SQL).bind(now, code),
  ]);

  // Everything above agreed this should work, and the write disagreed. That is
  // exactly the race, and the write is the one that is right.
  if (inserted.meta.changes !== 1) return { ok: false, refusal: 'raced', coupleId: invite.couple_id };

  return { ok: true, coupleId: invite.couple_id };
}
