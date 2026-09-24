import { corsHeaders, resolveAllowedOrigin } from './cors';
import {
  FIGHT_WINDOW_MS,
  bossMaxHp,
  bothReady,
  clampBlow,
  nextTier,
  readySlots,
  type BossState,
} from './boss';
import { drainNudges, prepareVapid } from './push';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}

/** Tokens are stored hashed: a leaked database should not be a set of logins. */
async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Caller {
  memberId: string;
  coupleId: string;
}

async function authenticate(request: Request, env: Env): Promise<Caller | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  // `revoked_at IS NULL` is what makes revocation mean anything. Both surfaces
  // read the same members table, so one flag turns a device off everywhere.
  const row = await env.DB.prepare(
    'SELECT id, couple_id FROM members WHERE token_hash = ? AND revoked_at IS NULL',
  )
    .bind(await hashToken(token))
    .first<{ id: string; couple_id: string }>();
  return row ? { memberId: row.id, coupleId: row.couple_id } : null;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });
}


interface BossRow {
  couple_id: string;
  tier: number;
  hp: number;
  max_hp: number;
  ready_a: string | null;
  ready_b: string | null;
  state: BossState;
  started_at: number | null;
  deadline_at: number | null;
  ended_at: number | null;
}

const BOSS_COLUMNS = `couple_id, tier, hp, max_hp, ready_a, ready_b, state,
                      started_at, deadline_at, ended_at`;

/** The shape the app renders. `ready` is by member id so it can name who. */
function bossView(row: BossRow, caller: Caller) {
  return {
    tier: row.tier,
    hp: row.hp,
    maxHp: row.max_hp,
    state: row.state,
    readyA: Boolean(row.ready_a),
    readyB: Boolean(row.ready_b),
    youAreReady: row.ready_a === caller.memberId || row.ready_b === caller.memberId,
    startedAt: row.started_at,
    deadlineAt: row.deadline_at,
    endedAt: row.ended_at,
  };
}

/**
 * Every couple has a fight, even before they have asked for one: reading is how
 * the screen finds out what tier they are on, and a missing row would make that
 * a special case on both sides.
 */
async function loadFight(env: Env, coupleId: string): Promise<BossRow> {
  const existing = await env.DB.prepare(
    `SELECT ${BOSS_COLUMNS} FROM boss_fights WHERE couple_id = ?`,
  ).bind(coupleId).first<BossRow>();
  if (existing) return existing;

  const now = Date.now();
  const maxHp = bossMaxHp(1);
  await env.DB.prepare(
    `INSERT INTO boss_fights (couple_id, tier, hp, max_hp, state, updated_at)
     VALUES (?, 1, ?, ?, 'gathering', ?)
     ON CONFLICT(couple_id) DO NOTHING`,
  ).bind(coupleId, maxHp, maxHp, now).run();

  return (await env.DB.prepare(
    `SELECT ${BOSS_COLUMNS} FROM boss_fights WHERE couple_id = ?`,
  ).bind(coupleId).first<BossRow>())!;
}

/** Roll a finished fight into the next one. Escalates on victory only. */
async function openNextFight(env: Env, row: BossRow): Promise<BossRow> {
  const tier = nextTier(row.tier, row.state === 'won');
  const maxHp = bossMaxHp(tier);
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE boss_fights
        SET tier = ?, hp = ?, max_hp = ?, ready_a = NULL, ready_b = NULL,
            state = 'gathering', started_at = NULL, deadline_at = NULL,
            ended_at = NULL, updated_at = ?
      WHERE couple_id = ?`,
  ).bind(tier, maxHp, maxHp, now, row.couple_id).run();

  return (await env.DB.prepare(
    `SELECT ${BOSS_COLUMNS} FROM boss_fights WHERE couple_id = ?`,
  ).bind(row.couple_id).first<BossRow>())!;
}

/**
 * Tell the other half of the couple, through the delivery path reminders
 * already use. Keyed per couple so a second tap replaces the pending nudge
 * rather than queueing a second one.
 */
async function nudgePartner(
  env: Env,
  caller: Caller,
  title: string,
  body: string,
): Promise<void> {
  const partner = await env.DB.prepare(
    'SELECT id FROM members WHERE couple_id = ? AND id != ? LIMIT 1',
  ).bind(caller.coupleId, caller.memberId).first<{ id: string }>();
  if (!partner) return;

  await env.DB.prepare(
    `INSERT INTO scheduled_nudges (key, couple_id, member_id, fire_at, title, body, path)
     VALUES (?, ?, ?, ?, ?, ?, '/boss')
     ON CONFLICT(key) DO UPDATE SET
       fire_at = excluded.fire_at, title = excluded.title,
       body = excluded.body, delivered_at = NULL`,
  ).bind(
    `boss:${caller.coupleId}:${partner.id}`,
    caller.coupleId,
    partner.id,
    Date.now(),
    title,
    body,
  ).run();
}

/** How long a crash report is kept before the cron sweeps it. */
const CLIENT_ERROR_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveAllowedOrigin(request.headers.get('origin'), env.ALLOWED_ORIGIN);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Unauthenticated: used to check a Worker URL during setup.
    if (url.pathname === '/health') {
      return json({ ok: true, push: Boolean(env.VAPID_PUBLIC_KEY) }, 200, origin);
    }

    // Pairing, entries and push-subscription registration all live on the
    // Pages side now (app/functions/api/pair/*, entries.ts, subscribe.ts) —
    // the shipped client is same-origin and never calls this Worker's own
    // origin for them. Only the boss fight stays here, for the reason below.
    const caller = await authenticate(request, env);
    if (!caller) return json({ error: 'unauthorized' }, 401, origin);

    /* -- the boss fight ------------------------------------------------------
     *
     * The one piece of state that cannot be client-side. Everything else in
     * HeartBeat renders from IndexedDB and syncs last-write-wins, which is
     * right for a record of what one person did. It is wrong for a number two
     * people are subtracting from at the same time: under last-write-wins one
     * of their hits would simply vanish. So HP lives here, and damage lands as
     * an atomic UPDATE rather than a read-modify-write.
     */
    if (url.pathname === '/boss' && request.method === 'GET') {
      return json({ boss: bossView(await loadFight(env, caller.coupleId), caller) }, 200, origin);
    }

    // Say you are ready. Both slots must fill before a fight starts — one
    // person cannot drag the other into a fight they would both wear.
    if (url.pathname === '/boss/ready' && request.method === 'POST') {
      let row = await loadFight(env, caller.coupleId);

      // Readying after a finished fight is how the next tier is opened.
      if (row.state === 'won' || row.state === 'lost') row = await openNextFight(env, row);
      if (row.state === 'fighting') {
        return json({ boss: bossView(row, caller) }, 200, origin);
      }

      const slots = readySlots(row, caller.memberId);
      if (!slots) return json({ boss: bossView(row, caller) }, 200, origin);

      const now = Date.now();
      const starting = bothReady(slots);
      await env.DB.prepare(
        `UPDATE boss_fights
            SET ready_a = ?, ready_b = ?, state = ?, started_at = ?, deadline_at = ?,
                updated_at = ?
          WHERE couple_id = ? AND state = 'gathering'`,
      ).bind(
        slots.ready_a,
        slots.ready_b,
        starting ? 'fighting' : 'gathering',
        starting ? now : null,
        starting ? now + FIGHT_WINDOW_MS : null,
        now,
        caller.coupleId,
      ).run();

      await nudgePartner(
        env,
        caller,
        starting ? 'The fight is on' : 'Ready when you are',
        starting
          ? `Tier ${row.tier}. You are both in.`
          : 'The other half of the couple has said ready.',
      );

      const after = await loadFight(env, caller.coupleId);
      return json({ boss: bossView(after, caller) }, 200, origin);
    }

    // Land a blow. `hp = MAX(0, hp - ?)` is atomic in SQL, so two phones
    // hitting at the same moment both count — which is the entire reason this
    // endpoint exists rather than a `tasks`-style entry.
    if (url.pathname === '/boss/attack' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { damage?: unknown };
      const row = await loadFight(env, caller.coupleId);
      if (row.state !== 'fighting') {
        return json({ error: 'no fight is running', boss: bossView(row, caller) }, 409, origin);
      }

      const damage = clampBlow(body.damage, row.max_hp);
      const now = Date.now();
      if (damage > 0) {
        await env.DB.prepare(
          `UPDATE boss_fights SET hp = MAX(0, hp - ?), updated_at = ?
            WHERE couple_id = ? AND state = 'fighting'`,
        ).bind(damage, now, caller.coupleId).run();

        await env.DB.prepare(
          `UPDATE boss_fights SET state = 'won', ended_at = ?, updated_at = ?
            WHERE couple_id = ? AND state = 'fighting' AND hp <= 0`,
        ).bind(now, now, caller.coupleId).run();
      }

      const after = await loadFight(env, caller.coupleId);
      if (after.state === 'won') {
        await nudgePartner(env, caller, 'It is down', `Tier ${after.tier} is finished.`);
      }
      return json({ boss: bossView(after, caller), damage }, 200, origin);
    }

    return json({ error: 'not found' }, 404, origin);
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    // Expire stale invites so a leaked link cannot be redeemed late.
    const now = Date.now();
    await env.DB.prepare('DELETE FROM invites WHERE expires_at < ? AND consumed_at IS NULL')
      .bind(now)
      .run();

    // A fight nobody finishes is lost rather than left open forever, so the
    // tier can be attempted again. A defeat re-runs the same tier — losing a
    // week should not mean the boss grew while you were having it.
    await env.DB.prepare(
      `UPDATE boss_fights SET state = 'lost', ended_at = ?, updated_at = ?
        WHERE state = 'fighting' AND deadline_at IS NOT NULL AND deadline_at < ?`,
    ).bind(now, now, now).run();

    // Crash reports age out after a week: one that old is either fixed or has
    // happened again since. Hourly rather than every minute — the cron fires 60
    // times an hour and 59 of those would delete nothing.
    //
    // Deliberately above the VAPID check below, which returns early. A deploy
    // with no push keys configured still has to sweep, or the table grows
    // forever on exactly the setups least likely to be watched.
    if (new Date(event.scheduledTime).getUTCMinutes() === 0) {
      await env.DB.prepare('DELETE FROM client_errors WHERE received_at < ?')
        .bind(now - CLIENT_ERROR_TTL_MS)
        .run();
    }

    // Deliver whatever is due. Without VAPID keys configured the Worker still
    // runs — pairing, sync and the boss fight do not need push — so a missing
    // key is a quiet no-op rather than a crashing cron, and `/health` already
    // reports `push: false` so the omission is visible.
    const vapid = await prepareVapid({
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    }).catch((error) => {
      console.error('VAPID keys are set but unusable', error);
      return null;
    });
    if (!vapid) return;

    const summary = await drainNudges(env.DB, vapid, {
      nowMs: now,
      onError: (message, error) => console.error(message, error),
    });
    if (summary.claimed > 0) console.log('push drain', summary);
  },
};
