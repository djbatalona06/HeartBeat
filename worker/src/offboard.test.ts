import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JOIN_INSERT_SQL } from './pairing';

/**
 * Leaving and inviting, against real SQLite with the real migrations. The SQL
 * is lifted out of app/functions/api/_offboard.ts rather than copied, so this
 * cannot pass while the function ships something different.
 */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => Db;
};
interface Db {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...v: unknown[]): unknown;
    run(...v: unknown[]): { changes: number | bigint };
  };
}

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS = join(HERE, '..', 'migrations');
const SOURCE = readFileSync(join(HERE, '..', '..', 'app', 'functions', 'api', '_offboard.ts'), 'utf8');

function sql(name: string): string {
  const match = new RegExp(`export const ${name} =\\s*(['\`])([\\s\\S]*?)\\1;`).exec(SOURCE);
  if (!match) throw new Error(`${name} not found in _offboard.ts`);
  return match[2];
}
const REVOKE = sql('REVOKE_MEMBER_SQL');
const DROPS = ['DROP_PUSH_SQL', 'DROP_NUDGES_SQL', 'DROP_GITHUB_SQL', 'DROP_GOOGLE_SQL', 'DROP_STUDY_SQL'].map(sql);
const INVITE = sql('INVITE_INSERT_SQL');

const NOW = 1_700_000_000_000;

function fresh(): Db {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(MIGRATIONS).sort()) db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  return db;
}

function seed(db: Db) {
  db.prepare('INSERT INTO couples (id, created_at) VALUES (?, ?)').run('c1', NOW);
  db.prepare('INSERT INTO couples (id, created_at) VALUES (?, ?)').run('c2', NOW);
  for (const [id, couple] of [['a', 'c1'], ['b', 'c1'], ['x', 'c2']]) {
    db.prepare('INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?,?,?,?,?)').run(
      id, couple, `h-${id}`, NOW, NOW,
    );
    db.prepare(
      'INSERT INTO push_subscriptions (endpoint, member_id, p256dh, auth, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    ).run(`https://push/${id}`, id, 'k', 'a', NOW, NOW);
    db.prepare(
      'INSERT INTO scheduled_nudges (key, couple_id, member_id, fire_at, title, body, path) VALUES (?,?,?,?,?,?,?)',
    ).run(`n-${id}`, couple, id, NOW, 't', 'b', '/');
  }
  db.prepare('INSERT INTO entries (id, couple_id, member_id, kind, day, payload, updated_at) VALUES (?,?,?,?,?,?,?)').run(
    'e1', 'c1', 'a', 'mood', '2026-09-06', '{}', NOW,
  );
}

const count = (db: Db, table: string, where: string, ...v: unknown[]) =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...v) as { n: number }).n);

/** Mirrors releaseMember(): the revoke alone first, the clears only if it landed. */
function release(db: Db, couple: string, member: string): boolean {
  const changed = Number(db.prepare(REVOKE).run(NOW, NOW, member, couple).changes);
  if (changed !== 1) return false;
  for (const drop of DROPS) db.prepare(drop).run(member);
  return true;
}

describe('leaving', () => {
  it('revokes the leaver, clears what could still act for them, and keeps the history', () => {
    const db = fresh();
    seed(db);
    expect(release(db, 'c1', 'a')).toBe(true);

    expect(db.prepare('SELECT revoked_at FROM members WHERE id = ?').get('a')).toEqual({ revoked_at: NOW });
    expect(count(db, 'push_subscriptions', 'member_id = ?', 'a')).toBe(0);
    expect(count(db, 'scheduled_nudges', 'member_id = ?', 'a')).toBe(0);
    // The other half keeps what the two of them made.
    expect(count(db, 'entries', 'member_id = ?', 'a')).toBe(1);
    expect(count(db, 'push_subscriptions', 'member_id = ?', 'b')).toBe(1);
  });

  it('cannot reach into another couple, even with a member id it guessed', () => {
    const db = fresh();
    seed(db);
    expect(release(db, 'c1', 'x')).toBe(false);
    expect(count(db, 'push_subscriptions', 'member_id = ?', 'x')).toBe(1);
    expect(db.prepare('SELECT revoked_at FROM members WHERE id = ?').get('x')).toEqual({ revoked_at: null });
  });

  it('does nothing the second time', () => {
    const db = fresh();
    seed(db);
    expect(release(db, 'c1', 'a')).toBe(true);
    expect(release(db, 'c1', 'a')).toBe(false);
  });
});

describe('inviting into a couple that has a free seat', () => {
  const mint = (db: Db, code: string, couple = 'c1') =>
    Number(db.prepare(INVITE).run(code, couple, NOW, NOW + 900_000, couple).changes);

  it('is refused while both seats are taken', () => {
    const db = fresh();
    seed(db);
    expect(mint(db, 'AAAAAA')).toBe(0);
  });

  it('is minted once a seat is free, and a new phone can join with it', () => {
    const db = fresh();
    seed(db);
    release(db, 'c1', 'b');
    expect(mint(db, 'BBBBBB')).toBe(1);

    const joined = db.prepare(JOIN_INSERT_SQL).run('m3', 'h-3', NOW, NOW, 'BBBBBB', NOW);
    expect(Number(joined.changes)).toBe(1);
    expect(db.prepare('SELECT couple_id FROM members WHERE id = ?').get('m3')).toEqual({ couple_id: 'c1' });
  });

  it('frees exactly one seat', () => {
    const db = fresh();
    seed(db);
    release(db, 'c1', 'b');
    mint(db, 'CCCCCC');
    mint(db, 'DDDDDD');
    db.prepare(JOIN_INSERT_SQL).run('m3', 'h-3', NOW, NOW, 'CCCCCC', NOW);
    expect(Number(db.prepare(JOIN_INSERT_SQL).run('m4', 'h-4', NOW, NOW, 'DDDDDD', NOW).changes)).toBe(0);
  });
});
