import type { Env } from './_lib';

/**
 * Turning one member off, shared by leaving and being removed.
 *
 * Revoking keeps the row, so the other half keeps the history the two of them
 * made. What it must not keep is anything that still *acts* for the person who
 * has gone: a push subscription would keep delivering to their phone, a queued
 * nudge would fire at it, and a GitHub or Google link would let them walk back
 * into the couple through account recovery. Those are removed with the flag.
 *
 * One statement per constant so worker/src/offboard.test.ts can lift each out
 * of this file and run it against real SQLite.
 */

export const REVOKE_MEMBER_SQL =
  'UPDATE members SET revoked_at = ?, updated_at = ? WHERE id = ? AND couple_id = ? AND revoked_at IS NULL';
export const DROP_PUSH_SQL = 'DELETE FROM push_subscriptions WHERE member_id = ?';
export const DROP_NUDGES_SQL = 'DELETE FROM scheduled_nudges WHERE member_id = ?';
export const DROP_GITHUB_SQL = 'DELETE FROM github_links WHERE member_id = ?';
export const DROP_GOOGLE_SQL = 'DELETE FROM google_links WHERE member_id = ?';
export const DROP_STUDY_SQL = 'DELETE FROM study_tokens WHERE member_id = ?';

/**
 * The invite for a seat that is free, minted from inside an existing couple.
 *
 * pair/start.ts is the only other place an invite is written and it always
 * opens a *new* couple, so before this a seat freed by leaving could never be
 * refilled. The gate is inside the INSERT for the same reason join's is: a read
 * beforehand could be raced into being wrong.
 */
export const INVITE_INSERT_SQL = `INSERT INTO invites (token, couple_id, created_at, expires_at)
SELECT ?, ?, ?, ?
 WHERE (SELECT COUNT(*) FROM members m
          WHERE m.couple_id = ? AND m.revoked_at IS NULL) < 2`;

/**
 * Revoke, then clear. The revoke runs first and alone, scoped to the caller's
 * couple, so a member id from someone else's couple changes nothing and reaches
 * none of the deletes. Returns false when there was nobody to turn off.
 */
export async function releaseMember(
  db: Env['DB'],
  coupleId: string,
  memberId: string,
  now: number,
): Promise<boolean> {
  const { meta } = await db
    .prepare(REVOKE_MEMBER_SQL)
    .bind(now, now, memberId, coupleId)
    .run();
  if (meta.changes !== 1) return false;
  await db.batch(
    [DROP_PUSH_SQL, DROP_NUDGES_SQL, DROP_GITHUB_SQL, DROP_GOOGLE_SQL, DROP_STUDY_SQL].map((sql) =>
      db.prepare(sql).bind(memberId),
    ),
  );
  return true;
}
