import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ENTRY_UPSERT_SQL } from '../../app/functions/api/entries';

/**
 * The day log's upsert against real SQLite with the real migrations, for the
 * one property the pull depends on: `seq` follows the server's write order, so
 * a mood stamped before the reader's cursor but pushed after it is still
 * served. Same arrangement as `holdings.test.ts`.
 */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { all(...v: unknown[]): unknown[]; run(...v: unknown[]): unknown };
  };
};

const MIGRATIONS = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'migrations');
const NOW = 1_700_000_000_000;

function fresh() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(MIGRATIONS).sort()) db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  db.prepare('INSERT INTO couples (id, created_at) VALUES (?, ?)').run('c1', NOW);
  for (const id of ['her', 'him']) {
    db.prepare('INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?,?,?,?,?)')
      .run(id, 'c1', `hash-${id}`, NOW, NOW);
  }
  return db;
}

describe('the entries pull order', () => {
  it('serves a mood pushed late with an older stamp than the cursor', () => {
    const db = fresh();
    const write = (member: string, updatedAt: number) =>
      db.prepare(ENTRY_UPSERT_SQL).run(`${member}-mood`, 'c1', member, 'mood', '2026-10-06', '{}', updatedAt);
    const pull = (after: number) =>
      db.prepare('SELECT id, seq FROM entries WHERE couple_id = ? AND seq > ? ORDER BY seq')
        .all('c1', after) as Array<{ id: string; seq: number }>;

    write('her', NOW + 60_000);
    const cursor = pull(0).at(-1)!.seq;
    write('him', NOW);
    expect(pull(cursor).map((r) => r.id)).toEqual(['him-mood']);

    // A refused (older) rewrite does not move the row.
    write('him', NOW - 1);
    expect(pull(cursor + 1)).toEqual([]);
  });
});
