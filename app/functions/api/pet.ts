import { authenticate, json, type Env } from './_lib';

/**
 * The couple's shared pet.
 *
 * The pet was never actually shared. `pets` was written exactly once, at
 * pairing, with defaults, and read by nothing; `db.pet` on the phone is not in
 * the sync client's KINDS. So each phone's bar showed that phone's own
 * contributions and called them "ours".
 *
 * XP is the one field where the entries table's last-write-wins is wrong. It is
 * additive: two phones each adding to it under last-write-wins would silently
 * discard one person's gains, which is precisely the argument that put boss HP
 * on the server. So it lands here, as `xp = xp + ?`, atomic in SQL.
 *
 * Additive also means a lost response is dangerous in a way an upsert is not: a
 * phone that posts, loses the connection and retries would pay twice. Every
 * award therefore carries an id and is recorded once in `pet_xp_awards`, whose
 * primary key is (couple_id, id) — a replay collides with itself and is
 * ignored. That is the "idempotency key per award" shape rather than the
 * "per-member monotonic ledger" one, because the awards this has to be right
 * about are boss victories, which both phones report for the same fight: a key
 * derived from the fight (`boss-<tier>`) makes the two reports one award, which
 * a per-member ledger could not do.
 *
 * Nothing here ever subtracts. A negative amount is a 400, not a debit.
 */

/** One page of awards. A phone back from a fortnight offline still fits. */
const MAX_AWARDS = 50;

/** No single award is worth more than several levels. A typo should not be. */
const MAX_AWARD_XP = 5000;

/** Long enough for a uuid or a `boss-<tier>`, short enough not to be a payload. */
const MAX_AWARD_ID = 100;

interface PetRow {
  level: number;
  xp: number;
  mood: string;
  fed_at: number;
}

interface Award {
  id: string;
  amount: number;
}

/**
 * The ledger is created on first use rather than in a migration.
 *
 * Migrations 0005 and 0006 are claimed by other work in flight, and a numbered
 * file racing for the same slot is a merge conflict that only shows up as a
 * broken deploy. `IF NOT EXISTS` is idempotent and costs one statement per
 * isolate; folding it into a migration once the numbering settles is the
 * follow-up, and it needs no data move because the table is append-only.
 */
let ledger: Promise<void> | null = null;

function ensureLedger(env: Env): Promise<void> {
  if (!ledger) {
    ledger = (async () => {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS pet_xp_awards (
           couple_id  TEXT NOT NULL,
           id         TEXT NOT NULL,
           member_id  TEXT NOT NULL,
           amount     INTEGER NOT NULL,
           credited   INTEGER NOT NULL DEFAULT 0,
           created_at INTEGER NOT NULL,
           PRIMARY KEY (couple_id, id)
         )`,
      ).run();
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_pet_xp_awards_uncredited
           ON pet_xp_awards (couple_id, credited)`,
      ).run();
    })().catch((err) => {
      // A failed creation must not be remembered as a success, or every later
      // request in this isolate would insert into a table that is not there.
      ledger = null;
      throw err;
    });
  }
  return ledger;
}

/** What both verbs answer with. `level` is the app's business — see below. */
async function petFor(env: Env, coupleId: string): Promise<PetRow> {
  const row = await env.DB.prepare(
    'SELECT level, xp, mood, fed_at FROM pets WHERE couple_id = ?',
  )
    .bind(coupleId)
    .first<PetRow>();
  return row ?? { level: 1, xp: 0, mood: 'content', fed_at: 0 };
}

function body(row: PetRow, settled: string[]) {
  return {
    xp: row.xp,
    // Stored, but stale: nothing has ever recomputed it. The app derives the
    // level from xp with levelProgress() and should keep doing so.
    level: row.level,
    mood: row.mood,
    fedAt: row.fed_at,
    // The ids now on record, so the phone can drop them from its queue. An id
    // that was already there comes back too: it is settled either way.
    settled,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);
  return json(body(await petFor(env, caller.coupleId), []));
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const parsed = (await request.json().catch(() => ({}))) as { awards?: unknown };
  if (!Array.isArray(parsed.awards)) return json({ error: 'awards required' }, 400);
  if (parsed.awards.length > MAX_AWARDS) return json({ error: 'too many awards' }, 413);

  const awards: Award[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.awards as Array<Record<string, unknown>>) {
    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
    const amount = typeof raw?.amount === 'number' ? raw.amount : NaN;
    if (!id || id.length > MAX_AWARD_ID) return json({ error: 'award id required' }, 400);
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AWARD_XP) {
      // Gain-only, stated where it can be enforced. The pet has no path down.
      return json({ error: 'award amount must be a whole number of XP to gain' }, 400);
    }
    // A batch that names the same award twice is one award, not two.
    if (seen.has(id)) continue;
    seen.add(id);
    awards.push({ id, amount });
  }

  await ensureLedger(env);
  const now = Date.now();

  if (awards.length > 0) {
    // The primary key does the deduplicating: a replayed award collides with
    // the row it wrote the first time and is ignored.
    await env.DB.batch(
      awards.map((a) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO pet_xp_awards
             (couple_id, id, member_id, amount, credited, created_at)
           VALUES (?, ?, ?, ?, 0, ?)`,
        ).bind(caller.coupleId, a.id, caller.memberId, a.amount, now),
      ),
    );
  }

  // Credit everything this couple has on record and not yet counted — ours, and
  // anything the other phone managed to record but not credit — then mark it.
  // One batch, so it is one transaction: the sum that was added is exactly the
  // set that gets marked, and a crash between the two leaves the awards
  // uncredited rather than counted twice. The next request picks them up.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pets (couple_id, level, xp, mood, fed_at)
       SELECT ?1, 1, COALESCE(SUM(amount), 0), 'content', ?2
         FROM pet_xp_awards WHERE couple_id = ?1 AND credited = 0
       ON CONFLICT(couple_id) DO UPDATE SET xp = xp + excluded.xp`,
    ).bind(caller.coupleId, now),
    env.DB.prepare(
      'UPDATE pet_xp_awards SET credited = 1 WHERE couple_id = ?1 AND credited = 0',
    ).bind(caller.coupleId),
  ]);

  return json(body(await petFor(env, caller.coupleId), [...seen]));
};
