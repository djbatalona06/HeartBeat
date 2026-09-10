import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  JOIN_CONSUME_SQL,
  JOIN_INSERT_SQL,
  joinCouple,
  type JoinDb,
} from './pairing';

/**
 * These run against real SQLite with the real migration files applied, rather
 * than a hand-written fake. The whole point of the change under test is what
 * the database does when two writes arrive at once, and a fake that returns
 * whatever the test wants would prove nothing about that.
 */
/**
 * Required rather than imported: `node:sqlite` is newer than this Vite's list
 * of Node builtins, so a static import is rewritten to a bare "sqlite" package
 * and fails to resolve. Going through createRequire keeps the specifier out of
 * Vite's static analysis.
 */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => SqliteDb;
};

/** Only what these tests touch. */
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: unknown[]): unknown;
    run(...values: unknown[]): { changes: number | bigint };
  };
}

const MIGRATIONS = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'migrations');

/** The slice of D1's interface joinCouple asks for, over node:sqlite. */
function d1(db: SqliteDb): JoinDb {
  const bind = (sql: string, values: unknown[]) => ({
    sql,
    values,
    async first<T>(): Promise<T | null> {
      return (db.prepare(sql).get(...values) as T) ?? null;
    },
    async run() {
      const info = db.prepare(sql).run(...values);
      return { meta: { changes: Number(info.changes) } };
    },
  });
  return {
    prepare: (sql: string) => ({ bind: (...values: unknown[]) => bind(sql, values) }),
    // D1 runs a batch as one transaction. So does this.
    async batch(statements) {
      const out: { meta: { changes: number } }[] = [];
      db.exec('BEGIN');
      try {
        for (const s of statements) out.push(await s.run());
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return out;
    },
  };
}

const NOW = 1_700_000_000_000;
const TTL = 15 * 60 * 1000;

function fresh(): SqliteDb {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(MIGRATIONS).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  return db;
}

function seedCouple(db: SqliteDb, coupleId = 'c1'): void {
  db.prepare('INSERT INTO couples (id, created_at) VALUES (?, ?)').run(coupleId, NOW);
  db.prepare(
    'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?,?,?,?,?)',
  ).run('m1', coupleId, 'hash-1', NOW, NOW);
}

function seedInvite(db: SqliteDb, token: string, coupleId = 'c1', expiresAt = NOW + TTL): void {
  db.prepare(
    'INSERT INTO invites (token, couple_id, created_at, expires_at) VALUES (?,?,?,?)',
  ).run(token, coupleId, NOW, expiresAt);
}

const countMembers = (db: SqliteDb, coupleId = 'c1') =>
  Number((db.prepare('SELECT COUNT(*) AS n FROM members WHERE couple_id = ?').get(coupleId) as { n: number }).n);

describe('joinCouple', () => {
  let db: SqliteDb;
  beforeEach(() => {
    db = fresh();
    seedCouple(db);
  });

  it('seats the second person', async () => {
    seedInvite(db, 'ABC123');
    const out = await joinCouple(d1(db), 'ABC123', 'm2', 'hash-2', NOW);
    expect(out).toEqual({ ok: true, coupleId: 'c1' });
    expect(countMembers(db)).toBe(2);
  });

  it('consumes the invite so it cannot be used again', async () => {
    seedInvite(db, 'ABC123');
    await joinCouple(d1(db), 'ABC123', 'm2', 'hash-2', NOW);
    const again = await joinCouple(d1(db), 'ABC123', 'm3', 'hash-3', NOW);
    expect(again.refusal).toBe('already-used');
    expect(countMembers(db)).toBe(2);
  });

  it('refuses an invite that does not exist', async () => {
    expect((await joinCouple(d1(db), 'NOPE', 'm2', 'h', NOW)).refusal).toBe('no-such-invite');
  });

  it('refuses an expired invite', async () => {
    seedInvite(db, 'OLD123', 'c1', NOW - 1);
    expect((await joinCouple(d1(db), 'OLD123', 'm2', 'h', NOW)).refusal).toBe('expired');
    expect(countMembers(db)).toBe(1);
  });

  it('refuses a third person on a full couple', async () => {
    db.prepare(
      'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?,?,?,?,?)',
    ).run('m2', 'c1', 'hash-2', NOW, NOW);
    seedInvite(db, 'ABC123');
    expect((await joinCouple(d1(db), 'ABC123', 'm3', 'h', NOW)).refusal).toBe('couple-full');
    expect(countMembers(db)).toBe(2);
  });

  /**
   * The bug this module exists for.
   *
   * A race cannot be staged with Promise.all here: node:sqlite is synchronous,
   * so two overlapping transactions on one connection is an error rather than a
   * race. But the race does not need staging — the guard is entirely inside the
   * write, so what a losing racer executes is exactly the second write below.
   * Both of these callers have already passed their diagnostic read and seen
   * room; that is the state the old count-then-insert could reach, and this is
   * what happens next.
   */
  it('admits only the first of two writes that both believed there was room', async () => {
    seedInvite(db, 'AAA111');
    seedInvite(db, 'BBB222');
    const api = d1(db);

    const write = (code: string, memberId: string) =>
      api.batch([
        api.prepare(JOIN_INSERT_SQL).bind(memberId, `h-${memberId}`, NOW, NOW, code, NOW),
        api.prepare(JOIN_CONSUME_SQL).bind(NOW, code),
      ]);

    const [first] = await write('AAA111', 'm2');
    const [second] = await write('BBB222', 'm3');

    expect(first.meta.changes).toBe(1);
    // The old shape wrote here too, and the couple ended up with three people.
    expect(second.meta.changes).toBe(0);
    expect(countMembers(db)).toBe(2);
  });

  it('admits only the first of two writes redeeming the same invite', async () => {
    seedInvite(db, 'AAA111');
    const api = d1(db);

    const write = (memberId: string) =>
      api.batch([
        api.prepare(JOIN_INSERT_SQL).bind(memberId, `h-${memberId}`, NOW, NOW, 'AAA111', NOW),
        api.prepare(JOIN_CONSUME_SQL).bind(NOW, 'AAA111'),
      ]);

    expect((await write('m2'))[0].meta.changes).toBe(1);
    // Single-use is enforced by the same statement that reads consumed_at, so
    // the second redemption cannot slip between the read and the update.
    expect((await write('m3'))[0].meta.changes).toBe(0);
    expect(countMembers(db)).toBe(2);
  });

  it('reports the refusal to a caller that lost such a race', async () => {
    seedInvite(db, 'AAA111');
    seedInvite(db, 'BBB222');
    await joinCouple(d1(db), 'AAA111', 'm2', 'hash-2', NOW);
    // Its own diagnostic read now sees a full couple, so it says so plainly.
    expect((await joinCouple(d1(db), 'BBB222', 'm3', 'hash-3', NOW)).refusal).toBe('couple-full');
    expect(countMembers(db)).toBe(2);
  });

  it('never puts a member in a couple the invite does not belong to', async () => {
    db.prepare('INSERT INTO couples (id, created_at) VALUES (?, ?)').run('c2', NOW);
    seedInvite(db, 'FORC2', 'c2');
    const out = await joinCouple(d1(db), 'FORC2', 'm9', 'h', NOW);
    expect(out.coupleId).toBe('c2');
    // couple_id comes from the invite row inside the INSERT, never from input.
    expect(countMembers(db, 'c1')).toBe(1);
    expect(countMembers(db, 'c2')).toBe(1);
  });
});

/**
 * app/functions/api/pair/join.ts serves the route the app actually calls; this
 * module serves the Worker's copy of it. _lib.ts already says the two surfaces
 * are "deliberately identical", which was a comment nothing enforced. Now the
 * admission SQL, at least, cannot drift without a test going red.
 */
describe('the two pairing surfaces', () => {
  // Normalised to LF: these assertions compare source text, and a Windows
  // checkout hands back CRLF, which would fail a multi-line toContain for a
  // reason that has nothing to do with the two surfaces drifting apart.
  const pagesJoin = readFileSync(
    join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'app', 'functions', 'api', 'pair', 'join.ts'),
    'utf8',
  )
    .replace(/\r\n/g, '\n');

  it('use the same guarded INSERT', () => {
    expect(pagesJoin).toContain(JOIN_INSERT_SQL);
  });

  it('use the same single-use UPDATE', () => {
    expect(pagesJoin).toContain(JOIN_CONSUME_SQL);
  });

  it('both let the write have the final say', () => {
    // The COUNT read is still there and should be — it is what turns a refusal
    // into a sentence someone can act on. What must not come back is it being
    // the *only* check, so this asserts the write's verdict is also honoured.
    expect(pagesJoin).toContain('inserted.meta.changes !== 1');
  });
});

/**
 * Revocation, as the two authenticate() implementations actually express it.
 *
 * The flag is only worth having if the lookup honours it, so this runs the same
 * SQL both surfaces run — see worker/src/index.ts and app/functions/api/_lib.ts.
 */
const AUTH_SQL = 'SELECT id, couple_id FROM members WHERE token_hash = ? AND revoked_at IS NULL';

describe('revocation', () => {
  const authenticate = (db: SqliteDb, hash: string) =>
    (db.prepare(AUTH_SQL).get(hash) as { id: string } | undefined) ?? null;

  it('lets a live token through', () => {
    const db = fresh();
    seedCouple(db);
    expect(authenticate(db, 'hash-1')?.id).toBe('m1');
  });

  it('stops a revoked token immediately', () => {
    const db = fresh();
    seedCouple(db);
    db.prepare('UPDATE members SET revoked_at = ? WHERE id = ?').run(NOW, 'm1');
    // A phone that is lost or sold used to stay paired forever.
    expect(authenticate(db, 'hash-1')).toBeNull();
  });

  it('keeps the member row, so the couple does not lose their history', () => {
    const db = fresh();
    seedCouple(db);
    db.prepare(
      'INSERT INTO entries (id, couple_id, member_id, kind, day, payload, updated_at) VALUES (?,?,?,?,?,?,?)',
    ).run('e1', 'c1', 'm1', 'mood', '2026-09-06', '{}', NOW);

    db.prepare('UPDATE members SET revoked_at = ? WHERE id = ?').run(NOW, 'm1');

    // Revoking a device is not forgetting a person: entries, messages and tasks
    // all reference members(id), and a DELETE would cascade their half away.
    const kept = db.prepare('SELECT COUNT(*) AS n FROM entries WHERE member_id = ?').get('m1');
    expect(Number((kept as { n: number }).n)).toBe(1);
    expect(countMembers(db)).toBe(1);
  });

  it('frees the seat, so a replacement phone can pair after one is lost', async () => {
    const db = fresh();
    seedCouple(db);
    db.prepare(
      'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?,?,?,?,?)',
    ).run('m2', 'c1', 'hash-2', NOW, NOW);
    seedInvite(db, 'ABC123');

    // Full: the replacement cannot get in while the lost phone still counts.
    expect((await joinCouple(d1(db), 'ABC123', 'm3', 'h', NOW)).refusal).toBe('couple-full');

    db.prepare('UPDATE members SET revoked_at = ? WHERE id = ?').run(NOW, 'm2');
    seedInvite(db, 'DEF456');

    // Revoked, so the seat is open. Counting revoked rows would have made
    // revocation brick the couple, since the row is kept for the history.
    expect((await joinCouple(d1(db), 'DEF456', 'm3', 'h', NOW)).ok).toBe(true);
    expect(authenticate(db, 'hash-2')).toBeNull();
  });

  it('still refuses a third live device once the seat is taken again', async () => {
    const db = fresh();
    seedCouple(db);
    db.prepare(
      'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?,?,?,?,?)',
    ).run('m2', 'c1', 'hash-2', NOW, NOW);
    db.prepare('UPDATE members SET revoked_at = ? WHERE id = ?').run(NOW, 'm2');
    seedInvite(db, 'DEF456');
    seedInvite(db, 'GHI789');

    expect((await joinCouple(d1(db), 'DEF456', 'm3', 'h', NOW)).ok).toBe(true);
    // Freeing a seat frees exactly one.
    expect((await joinCouple(d1(db), 'GHI789', 'm4', 'h', NOW)).refusal).toBe('couple-full');
  });
});
