import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAIM_CONSUME_SQL, CLAIM_INSERT_SQL, STATE_CONSUME_SQL, STATE_INSERT_SQL,
} from '../../app/functions/api/auth/_oauth';
import { LINK_UPSERT_SQL, RECOVER_LOOKUP_SQL } from '../../app/functions/api/auth/_google';

/**
 * The security properties of Google account recovery, against real SQLite with
 * the real migrations applied.
 *
 * `githubAuth.test.ts` states at length why these are tested this way and not
 * with a fake; the short version is that every property here is a WHERE clause,
 * none is visible from outside — a refused write and a write that happened to
 * change nothing look identical to the caller — and this is auth.
 *
 * Two things are here that its sibling cannot cover, because they only exist
 * once there are two providers: that neither can spend the other's state or
 * claim, and that the two link tables are genuinely separate doors.
 *
 * What is deliberately *not* here: Google's own token exchange. `identify` is a
 * pair of `fetch` calls to google.com, and a test that stubbed them would be
 * testing the stub.
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

describe('connecting a Google account', () => {
  let db: SqliteDb;
  beforeEach(() => { db = fresh(); });

  const link = (googleId: string, member: string) =>
    Number(db.prepare(LINK_UPSERT_SQL).run(googleId, member, NOW, NOW).changes);

  const owner = (googleId: string) =>
    (db.prepare('SELECT member_id FROM google_links WHERE google_user_id = ?')
      .get(googleId) as { member_id: string } | undefined)?.member_id;

  it('connects an account to the member that asked', () => {
    expect(link('sub-1', 'her')).toBe(1);
    expect(owner('sub-1')).toBe('her');
  });

  it('is idempotent for the same member reconnecting', () => {
    link('sub-1', 'her');
    expect(link('sub-1', 'her')).toBe(1);
    expect(owner('sub-1')).toBe('her');
  });

  /** The guard on the conflict branch. Without it, signing in with an account
   *  somebody else has connected would silently move their recovery to you. */
  it('never moves an account already connected to somebody else', () => {
    link('sub-1', 'her');
    expect(link('sub-1', 'him')).toBe(0);
    expect(owner('sub-1')).toBe('her');
  });

  /** The unique index in the other direction. Several accounts that each
   *  recover one member are several keys to a door Settings shows one of. */
  it('refuses a second Google account for a member that already has one', () => {
    link('sub-1', 'her');
    expect(() => link('sub-2', 'her')).toThrow();
  });

  it('lets the two members connect different accounts', () => {
    expect(link('sub-1', 'her')).toBe(1);
    expect(link('sub-2', 'him')).toBe(1);
  });

  it('goes away with the member, rather than pointing at nothing', () => {
    link('sub-1', 'her');
    db.prepare('DELETE FROM members WHERE id = ?').run('her');
    expect(owner('sub-1')).toBeUndefined();
  });

  /**
   * The privacy property, and the reason the README can still say the app
   * holds no email addresses with this feature switched on. The `openid` scope
   * reveals no address, and there is nowhere here to put one if it did.
   */
  it('has nowhere to put an email address', () => {
    const columns = (db.prepare('PRAGMA table_info(google_links)').all() as Array<{ name: string }>)
      .map((c) => c.name);
    expect(columns).toEqual(['google_user_id', 'member_id', 'created_at', 'updated_at']);
  });
});

describe('recovering with a Google account', () => {
  let db: SqliteDb;
  beforeEach(() => { db = fresh(); });

  const link = (googleId: string, member: string) =>
    db.prepare(LINK_UPSERT_SQL).run(googleId, member, NOW, NOW);

  const recover = (googleId: string) =>
    db.prepare(RECOVER_LOOKUP_SQL).get(googleId) as
      { member_id: string; couple_id: string } | undefined;

  it('returns the member the account was connected to, and their couple', () => {
    link('sub-1', 'her');
    expect(recover('sub-1')).toMatchObject({ member_id: 'her', couple_id: 'c1' });
  });

  /** The whole framing: this is not a way to *become* a member. An account
   *  nobody connected gets no member, no couple, and no offer to make one. */
  it('returns nothing for an account nobody connected', () => {
    expect(recover('sub-never-seen')).toBeFalsy();
  });

  /** Revocation has to mean something against this route, or it is the way
   *  around it. */
  it('returns nothing for a member whose device was revoked', () => {
    link('sub-1', 'her');
    db.prepare('UPDATE members SET revoked_at = ? WHERE id = ?').run(NOW, 'her');
    expect(recover('sub-1')).toBeFalsy();
  });

  it('recovers only the connected member, never their partner', () => {
    link('sub-1', 'her');
    expect(recover('sub-1')?.member_id).toBe('her');
  });
});

/**
 * The properties that only exist because there are two providers.
 *
 * A crossed round trip is not obviously exploitable — the intent and the member
 * binding carry the security, and the identity still comes from whichever
 * provider was actually consulted — but "not obviously exploitable" is a thin
 * thing to rest an auth boundary on when the fix is one column, so it is a
 * column, and this is what says the column works.
 */
describe('the two providers', () => {
  let db: SqliteDb;
  beforeEach(() => { db = fresh(); });

  const start = (state: string, provider: string) =>
    db.prepare(STATE_INSERT_SQL).run(state, 'recover', null, NOW, LATER, provider);

  const consumeState = (state: string, provider: string) =>
    db.prepare(STATE_CONSUME_SQL).get(state, NOW, provider) as { intent: string } | undefined;

  const park = (code: string, provider: string) =>
    db.prepare(CLAIM_INSERT_SQL).run(code, 'recovered', 'her', 'c1', '', NOW, LATER, provider);

  const consumeClaim = (code: string, provider: string) =>
    db.prepare(CLAIM_CONSUME_SQL).get(code, NOW, provider) as { outcome: string } | undefined;

  it('will not let one provider spend the other provider\'s state', () => {
    start('s1', 'google');
    expect(consumeState('s1', 'github')).toBeFalsy();
    // And is still there for the provider it belongs to — a refused read must
    // not become a delete that consumes it anyway.
    expect(consumeState('s1', 'google')).toMatchObject({ intent: 'recover' });
  });

  it('will not let one provider spend the other provider\'s claim', () => {
    park('k1', 'google');
    expect(consumeClaim('k1', 'github')).toBeFalsy();
    expect(consumeClaim('k1', 'google')).toMatchObject({ outcome: 'recovered' });
  });

  /** Every row written before 0015 was a GitHub round trip, and has to keep
   *  meaning that rather than becoming unconsumable on deploy. */
  it('reads a row written before the column existed as GitHub\'s', () => {
    db.prepare(
      `INSERT INTO oauth_states (state, intent, member_id, created_at, expires_at)
       VALUES (?,?,?,?,?)`,
    ).run('old', 'recover', null, NOW, LATER);
    expect(consumeState('old', 'github')).toMatchObject({ intent: 'recover' });
  });

  /** Two doors, two keys. A member may connect both, and neither table knows
   *  about the other. */
  it('lets one member connect both providers, as two separate ways back', () => {
    db.prepare(LINK_UPSERT_SQL).run('sub-1', 'her', NOW, NOW);
    db.prepare(
      `INSERT INTO github_links (github_user_id, member_id, github_login, created_at, updated_at)
       VALUES (?,?,?,?,?)`,
    ).run('gh-1', 'her', 'octocat', NOW, NOW);

    expect(db.prepare(RECOVER_LOOKUP_SQL).get('sub-1')).toMatchObject({ member_id: 'her' });
    expect(db.prepare('SELECT member_id FROM github_links WHERE github_user_id = ?').get('gh-1'))
      .toMatchObject({ member_id: 'her' });
  });
});
