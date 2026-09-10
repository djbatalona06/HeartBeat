import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { UPSERT_SQL } from '../../app/functions/api/holdings';

/**
 * The RPG layer's upsert, against real SQLite with the real migrations
 * applied.
 *
 * Its two guard clauses are the whole of that endpoint's correctness and
 * neither is visible from the outside: a refused write and a write that
 * happened to change nothing look identical to the caller, so a bug in either
 * one is silent by construction. One of them — "a member cannot overwrite
 * their partner's possessions" — is a security property, and a security
 * property nobody exercises is a comment.
 *
 * The same arrangement `pairing.test.ts` uses, for the same stated reason: a
 * hand-written fake would return whatever the test wanted and prove nothing
 * about what the database actually does with this statement.
 */

/** Required rather than imported — see the note in `pairing.test.ts`. */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => SqliteDb;
};

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: unknown[]): unknown;
    all(...values: unknown[]): unknown[];
    run(...values: unknown[]): { changes: number | bigint };
  };
}

const MIGRATIONS = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'migrations');
const NOW = 1_700_000_000_000;

function fresh(): SqliteDb {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(MIGRATIONS).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  db.prepare('INSERT INTO couples (id, created_at) VALUES (?, ?)').run('c1', NOW);
  for (const id of ['her', 'him']) {
    db.prepare(
      'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?,?,?,?,?)',
    ).run(id, 'c1', `hash-${id}`, NOW, NOW);
  }
  return db;
}

describe('the holdings upsert', () => {
  let db: SqliteDb;
  beforeEach(() => { db = fresh(); });

  /** As the endpoint calls it: couple and member come from the bearer. */
  const write = (
    caller: string,
    row: { id: string; kind: string; payload: string; updatedAt: number },
  ) => Number(
    db.prepare(UPSERT_SQL)
      .run(row.id, row.kind, 'c1', caller, row.payload, row.updatedAt).changes,
  );

  const read = (kind: string, id: string) =>
    db.prepare('SELECT member_id, payload, updated_at FROM holdings WHERE kind = ? AND id = ?')
      .get(kind, id) as { member_id: string; payload: string; updated_at: number } | undefined;

  it('stores a row the first time it is offered', () => {
    expect(write('her', { id: 'inv-1', kind: 'inventory', payload: '{"refine":0}', updatedAt: NOW }))
      .toBe(1);
    expect(read('inventory', 'inv-1')).toMatchObject({ member_id: 'her', updated_at: NOW });
  });

  it('lets a member update their own row when it is newer', () => {
    write('her', { id: 'inv-1', kind: 'inventory', payload: '{"refine":0}', updatedAt: NOW });
    expect(write('her', { id: 'inv-1', kind: 'inventory', payload: '{"refine":3}', updatedAt: NOW + 1 }))
      .toBe(1);
    expect(read('inventory', 'inv-1')?.payload).toBe('{"refine":3}');
  });

  /**
   * Last write wins by the row's own `updatedAt`, not by arrival order. Two
   * phones syncing after a flight would otherwise let the slower connection
   * overwrite the newer edit.
   */
  it('refuses an older write even from the row\'s own member', () => {
    write('her', { id: 'inv-1', kind: 'inventory', payload: '{"refine":3}', updatedAt: NOW + 10 });
    expect(write('her', { id: 'inv-1', kind: 'inventory', payload: '{"refine":0}', updatedAt: NOW }))
      .toBe(0);
    expect(read('inventory', 'inv-1')?.payload).toBe('{"refine":3}');
  });

  it('refuses a write at exactly the same instant, so a re-offer is a no-op', () => {
    write('her', { id: 'inv-1', kind: 'inventory', payload: '{"refine":3}', updatedAt: NOW });
    expect(write('her', { id: 'inv-1', kind: 'inventory', payload: '{"refine":9}', updatedAt: NOW }))
      .toBe(0);
  });

  /** The security property. */
  it('never lets one member overwrite the other\'s personal row, however new', () => {
    write('her', { id: 'inv-1', kind: 'inventory', payload: '{"refine":3}', updatedAt: NOW });
    expect(write('him', { id: 'inv-1', kind: 'inventory', payload: '{"refine":0}', updatedAt: NOW + 9999 }))
      .toBe(0);
    expect(read('inventory', 'inv-1')).toMatchObject({ member_id: 'her', payload: '{"refine":3}' });
  });

  it('holds that line for every personal kind, not just inventory', () => {
    for (const kind of ['inventory', 'pet', 'avatar', 'task']) {
      write('her', { id: `x-${kind}`, kind, payload: '{"mine":true}', updatedAt: NOW });
      expect(
        write('him', { id: `x-${kind}`, kind, payload: '{"mine":false}', updatedAt: NOW + 9999 }),
        kind,
      ).toBe(0);
      expect(read(kind, `x-${kind}`)?.member_id, kind).toBe('her');
    }
  });

  /**
   * The one exception, and it is deliberate: a quest is taken on together,
   * either of you can start or retire it, and both devices have to converge on
   * the same one.
   */
  it('lets either member write a quest, because it belongs to the couple', () => {
    write('her', { id: 'q1', kind: 'quest', payload: '{"progress":1}', updatedAt: NOW });
    expect(write('him', { id: 'q1', kind: 'quest', payload: '{"progress":2}', updatedAt: NOW + 1 }))
      .toBe(1);
    const row = read('quest', 'q1');
    expect(row?.payload).toBe('{"progress":2}');
    // The writer of record moves with the write.
    expect(row?.member_id).toBe('him');
  });

  it('still applies last-write-wins to a shared quest', () => {
    write('her', { id: 'q1', kind: 'quest', payload: '{"progress":5}', updatedAt: NOW + 10 });
    expect(write('him', { id: 'q1', kind: 'quest', payload: '{"progress":1}', updatedAt: NOW }))
      .toBe(0);
    expect(read('quest', 'q1')?.payload).toBe('{"progress":5}');
  });

  /**
   * The composite key. A client id is only unique within its own kind — an
   * avatar is keyed by member id and a quest by a uuid — so two kinds sharing
   * an id must be two rows, not one overwriting the other.
   */
  it('keeps two kinds that share an id apart', () => {
    write('her', { id: 'same', kind: 'avatar', payload: '{"coins":1}', updatedAt: NOW });
    write('her', { id: 'same', kind: 'task', payload: '{"title":"x"}', updatedAt: NOW });
    expect(read('avatar', 'same')?.payload).toBe('{"coins":1}');
    expect(read('task', 'same')?.payload).toBe('{"title":"x"}');
  });

  it('refuses a kind the schema does not know', () => {
    expect(() =>
      write('her', { id: 'a', kind: 'achievement', payload: '{}', updatedAt: NOW }),
    ).toThrow();
  });

  /** The pull's only query, so the index it rides on is worth exercising. */
  it('serves a couple\'s rows in cursor order', () => {
    write('her', { id: 'a', kind: 'inventory', payload: '{}', updatedAt: NOW + 2 });
    write('him', { id: 'b', kind: 'inventory', payload: '{}', updatedAt: NOW + 1 });
    write('her', { id: 'c', kind: 'inventory', payload: '{}', updatedAt: NOW + 3 });
    const rows = db.prepare(
      `SELECT id FROM holdings WHERE couple_id = ? AND updated_at > ?
        ORDER BY updated_at ASC, kind ASC, id ASC`,
    ).all('c1', NOW + 1) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(['a', 'c']);
  });
});
