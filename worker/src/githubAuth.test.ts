import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAIM_CONSUME_SQL, LINK_UPSERT_SQL, RECOVER_LOOKUP_SQL, STATE_CONSUME_SQL,
} from '../../app/functions/api/auth/_github';

/**
 * The security properties of GitHub account recovery, against real SQLite with
 * the real migrations applied.
 *
 * Every one of them is a WHERE clause, and not one is visible from outside: a
 * refused write and a write that happened to change nothing look identical to
 * the caller, so a bug in any of them is silent by construction. This is auth —
 * the thing these clauses protect is the couple's whole account — and a
 * security property nobody exercises is a comment.
 *
 * The same arrangement `pairing.test.ts` uses for the join race and
 * `holdings.test.ts` for the ownership guard, for the reason `pairing.test.ts`
 * states: a hand-written fake returns whatever the test wants and proves
 * nothing about what the database does.
 *
 * What is deliberately *not* here: GitHub's own token exchange. `identify` is a
 * pair of `fetch` calls to github.com, and a test that stubs them would be
 * testing the stub. What can be tested is everything this repository decides,
 * which is all of the below.
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
const LATER = NOW + 10 * 60 * 1000;

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

describe('the OAuth state', () => {
  let db: SqliteDb;
  beforeEach(() => { db = fresh(); });

  const start = (state: string, intent: string, member: string | null, expires = LATER) =>
    db.prepare(
      `INSERT INTO oauth_states (state, intent, member_id, created_at, expires_at, provider)
       VALUES (?,?,?,?,?,'github')`,
    ).run(state, intent, member, NOW, expires);

  const consume = (state: string, at = NOW) =>
    db.prepare(STATE_CONSUME_SQL).get(state, at, 'github') as
      { intent: string; member_id: string | null } | undefined;

  it('hands back the intent and member it was started with', () => {
    start('s1', 'link', 'her');
    expect(consume('s1')).toMatchObject({ intent: 'link', member_id: 'her' });
  });

  /**
   * The entire job of the `state` parameter. If a callback could be replayed,
   * anyone who saw the URL once could re-run it.
   */
  it('is single-use: a replayed callback finds nothing', () => {
    start('s1', 'link', 'her');
    expect(consume('s1')).toBeTruthy();
    expect(consume('s1')).toBeFalsy();
  });

  it('refuses a state nobody started', () => {
    expect(consume('never-issued')).toBeFalsy();
  });

  it('refuses an expired state, and consumes nothing in the process', () => {
    start('s1', 'link', 'her', NOW - 1);
    expect(consume('s1')).toBeFalsy();
    // Still there, and still expired — a failed read must not become a delete
    // that hides the evidence.
    const left = db.prepare('SELECT state FROM oauth_states WHERE state = ?').get('s1');
    expect(left).toBeTruthy();
  });

  /** A recover state binds to no member: which one it is, is GitHub's answer. */
  it('carries no member for a recovery', () => {
    start('s2', 'recover', null);
    expect(consume('s2')).toMatchObject({ intent: 'recover', member_id: null });
  });

  it('accepts no intent the schema does not know', () => {
    expect(() => start('s3', 'become-admin', null)).toThrow();
  });
});

describe('the claim code', () => {
  let db: SqliteDb;
  beforeEach(() => { db = fresh(); });

  const park = (code: string, outcome: string, expires = LATER) =>
    db.prepare(
      `INSERT INTO oauth_claims
         (code, outcome, member_id, couple_id, github_login, created_at, expires_at, provider)
       VALUES (?,?,?,?,?,?,?,'github')`,
    ).run(code, outcome, 'her', 'c1', 'octocat', NOW, expires);

  const consume = (code: string, at = NOW) =>
    db.prepare(CLAIM_CONSUME_SQL).get(code, at, 'github') as
      { outcome: string; member_id: string } | undefined;

  it('is single-use, like the state', () => {
    park('k1', 'recovered');
    expect(consume('k1')).toMatchObject({ outcome: 'recovered', member_id: 'her' });
    expect(consume('k1')).toBeFalsy();
  });

  it('expires', () => {
    park('k1', 'recovered', NOW - 1);
    expect(consume('k1')).toBeFalsy();
  });

  /**
   * The design decision this table exists to make good on: the claim carries an
   * identity and never a bearer, so no live token is ever at rest. A `token`
   * column reappearing here would be the regression.
   */
  it('has nowhere to put a token', () => {
    const columns = (db.prepare('PRAGMA table_info(oauth_claims)').all() as Array<{ name: string }>)
      .map((c) => c.name);
    expect(columns).not.toContain('token');
    expect(columns).not.toContain('token_hash');
  });
});

describe('connecting a GitHub account', () => {
  let db: SqliteDb;
  beforeEach(() => { db = fresh(); });

  const link = (githubId: string, member: string, login = 'octocat') =>
    Number(db.prepare(LINK_UPSERT_SQL).run(githubId, member, login, NOW, NOW).changes);

  const owner = (githubId: string) =>
    (db.prepare('SELECT member_id FROM github_links WHERE github_user_id = ?').get(githubId) as
      { member_id: string } | undefined)?.member_id;

  it('connects an account to the member that asked', () => {
    expect(link('gh-1', 'her')).toBe(1);
    expect(owner('gh-1')).toBe('her');
  });

  it('refreshes the login on a re-connect by the same member', () => {
    link('gh-1', 'her', 'old-name');
    expect(link('gh-1', 'her', 'new-name')).toBe(1);
    const row = db.prepare('SELECT github_login FROM github_links WHERE github_user_id = ?')
      .get('gh-1') as { github_login: string };
    expect(row.github_login).toBe('new-name');
  });

  /**
   * The guard. Without the WHERE on the conflict branch this would quietly
   * move somebody else's connected account onto the caller — which is a way
   * into their couple, and the one thing this feature must not be.
   */
  it('never moves an account already connected to somebody else', () => {
    link('gh-1', 'her');
    expect(link('gh-1', 'him')).toBe(0);
    expect(owner('gh-1')).toBe('her');
  });

  /** One key per door: a member accumulating accounts would be several keys
   *  to the same door that Settings only ever shows one of. */
  it('refuses a second GitHub account for a member that already has one', () => {
    link('gh-1', 'her');
    expect(() => link('gh-2', 'her')).toThrow();
  });

  it('lets the two members connect different accounts', () => {
    expect(link('gh-1', 'her')).toBe(1);
    expect(link('gh-2', 'him')).toBe(1);
  });

  it('goes away with the member, rather than pointing at nothing', () => {
    link('gh-1', 'her');
    db.prepare('DELETE FROM members WHERE id = ?').run('her');
    expect(owner('gh-1')).toBeUndefined();
  });
});

describe('recovering with a GitHub account', () => {
  let db: SqliteDb;
  beforeEach(() => { db = fresh(); });

  const recover = (githubId: string) =>
    db.prepare(RECOVER_LOOKUP_SQL).get(githubId) as
      { member_id: string; couple_id: string } | undefined;

  it('returns the member the account was connected to, and their couple', () => {
    db.prepare(LINK_UPSERT_SQL).run('gh-1', 'her', 'octocat', NOW, NOW);
    expect(recover('gh-1')).toMatchObject({ member_id: 'her', couple_id: 'c1' });
  });

  /**
   * The property that keeps this from being a way *into* a couple: an account
   * nobody connected recovers nothing at all. Not an empty couple, not a new
   * member, not an offer to make one.
   */
  it('returns nothing for an account nobody connected', () => {
    expect(recover('gh-stranger')).toBeUndefined();
  });

  /** Revocation has to mean something here too, or this is the way around it. */
  it('returns nothing for a member whose device was revoked', () => {
    db.prepare(LINK_UPSERT_SQL).run('gh-1', 'her', 'octocat', NOW, NOW);
    db.prepare('UPDATE members SET revoked_at = ? WHERE id = ?').run(NOW, 'her');
    expect(recover('gh-1')).toBeUndefined();
  });

  it('recovers only the connected member, never their partner', () => {
    db.prepare(LINK_UPSERT_SQL).run('gh-1', 'her', 'octocat', NOW, NOW);
    expect(recover('gh-1')?.member_id).toBe('her');
  });
});
