import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The two things /api/study/session must not get wrong, run against real SQLite
 * with the real migrations.
 *
 * Both are silent when they break. A replay that credits twice inflates a
 * shared pet with no error anywhere, and a daily cap that does not accumulate
 * simply never applies. Neither shows up in a typecheck.
 */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => SqliteDb;
};

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...v: unknown[]): unknown;
    run(...v: unknown[]): { changes: number | bigint };
    all(...v: unknown[]): unknown[];
  };
}

const ROOT = join(new URL('.', import.meta.url).pathname, '..', '..');
const MIGRATIONS = join(ROOT, 'worker', 'migrations');
const SESSION_FN = join(ROOT, 'app', 'functions', 'api', 'study', 'session.ts');

const NOW = 1_757_000_000_000;
const CAP = 120;

/**
 * pet_xp_awards is created lazily by functions/api/pet.ts rather than by a
 * migration, so it is created here the same way. Kept verbatim from that file.
 */
const LEDGER = `CREATE TABLE IF NOT EXISTS pet_xp_awards (
  couple_id  TEXT NOT NULL,
  id         TEXT NOT NULL,
  member_id  TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  credited   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (couple_id, id)
)`;

function fresh(): SqliteDb {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync(MIGRATIONS).sort()) db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  db.exec(LEDGER);
  db.prepare('INSERT INTO couples (id, created_at) VALUES (?, ?)').run('c1', NOW);
  db.prepare(
    'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?,?,?,?,?)',
  ).run('m1', 'c1', 'h1', NOW, NOW);
  return db;
}

/** The write the endpoint performs, with its clamp, for one session. */
function record(db: SqliteDb, sessionId: string, worth: number, day = '2026-09-06'): number {
  const awardId = `study-${sessionId}`;
  const seen = db
    .prepare('SELECT 1 AS seen FROM pet_xp_awards WHERE couple_id = ? AND id = ?')
    .get('c1', awardId);
  if (seen) return 0;

  const spent = db
    .prepare('SELECT xp FROM study_days WHERE member_id = ? AND day = ?')
    .get('m1', day) as { xp: number } | undefined;
  const gain = Math.max(0, Math.min(worth, CAP - (spent?.xp ?? 0)));

  db.prepare(
    `INSERT OR IGNORE INTO pet_xp_awards (couple_id, id, member_id, amount, credited, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
  ).run('c1', awardId, 'm1', gain, NOW);
  db.prepare(
    `INSERT INTO study_days (member_id, day, xp, sessions) VALUES (?, ?, ?, 1)
     ON CONFLICT(member_id, day) DO UPDATE SET xp = xp + excluded.xp, sessions = sessions + 1`,
  ).run('m1', day, gain);
  return gain;
}

const totalAwarded = (db: SqliteDb) =>
  Number(
    (db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM pet_xp_awards').get() as { n: number }).n,
  );

describe('recording a study session', () => {
  let db: SqliteDb;
  beforeEach(() => { db = fresh(); });

  it('credits a session once', () => {
    expect(record(db, 'session-01', 25)).toBe(25);
    expect(totalAwarded(db)).toBe(25);
  });

  it('pays nothing for a replay of the same session', () => {
    record(db, 'session-01', 25);
    // The offline queue in the study app resends until it gets an answer, so
    // this is the normal case, not the adversarial one.
    expect(record(db, 'session-01', 25)).toBe(0);
    expect(record(db, 'session-01', 25)).toBe(0);
    expect(totalAwarded(db)).toBe(25);
  });

  it('accumulates the day, so the cap can actually be reached', () => {
    for (let i = 0; i < 4; i += 1) record(db, `session-0${i}`, 25);
    const row = db.prepare('SELECT xp, sessions FROM study_days').get() as { xp: number; sessions: number };
    expect(row).toEqual({ xp: 100, sessions: 4 });
  });

  it('clamps at the ceiling rather than refusing the session', () => {
    for (let i = 0; i < 4; i += 1) record(db, `session-1${i}`, 25); // 100
    // 20 left, and a 25-point session should take the 20 rather than nothing.
    expect(record(db, 'session-19', 25)).toBe(20);
    expect(record(db, 'session-20', 25)).toBe(0);
    expect(totalAwarded(db)).toBe(CAP);
  });

  it('starts a new day with a fresh allowance', () => {
    for (let i = 0; i < 6; i += 1) record(db, `session-2${i}`, 25);
    expect(totalAwarded(db)).toBe(CAP);
    expect(record(db, 'session-next', 25, '2026-09-07')).toBe(25);
  });

  it('leaves the award uncredited, so only /api/pet moves the bar', () => {
    record(db, 'session-01', 25);
    const row = db.prepare('SELECT credited FROM pet_xp_awards').get() as { credited: number };
    // Crediting from two places is how a shared bar counts an award twice.
    expect(Number(row.credited)).toBe(0);
  });
});

describe('the endpoint and the tested domain module', () => {
  const source = readFileSync(SESSION_FN, 'utf8');

  it('uses the same daily ceiling', () => {
    expect(source).toContain('const STUDY_DAILY_CAP = 120;');
  });

  it('never credits pets directly', () => {
    // functions/api/pet.ts owns that read-modify-write, in one transaction with
    // the marking. A second writer is how the bar double-counts.
    expect(source).not.toMatch(/INSERT INTO pets/);
    expect(source).not.toMatch(/UPDATE\s+pets/);
  });

  it('authenticates against study_tokens, never against members', () => {
    expect(source).toContain('FROM study_tokens');
    expect(source).not.toMatch(/FROM members/);
  });
});
