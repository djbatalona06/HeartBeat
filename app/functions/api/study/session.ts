import { hashToken, type Env } from '../_lib';

/**
 * A finished study session, arriving from Jenny's study app.
 *
 * This is the whole integration. Her app is a separate PWA on a separate
 * origin; when she finishes a deck or a quiz there, the couple's pet gains XP
 * here. Nothing else crosses in either direction.
 *
 * Four things this has to get right, in the order they bite:
 *
 *  1. **It is not a member.** The study app has no accounts, so it holds a
 *     scoped token from `study_tokens` and this route authenticates that alone.
 *     A member's bearer would let it read the couple's whole record.
 *  2. **It is called from another origin**, so it answers a CORS preflight —
 *     the only route in `functions/` that has to, since everything else is
 *     same-origin by construction.
 *  3. **A retry must not pay twice.** The study app queues sessions offline and
 *     resends them, so the award id comes from the session's own id and the
 *     ledger's primary key does the deduplicating.
 *  4. **A day means the member's day.** The study app dates its streak in UTC
 *     and its wallet in local time; the ceiling here uses the timezone captured
 *     when the link was minted, which is the one the person actually lives in.
 *
 * The XP values, the cap and the day-key rule live in
 * `app/src/domain/study/award.ts`, which is tested. They are restated here
 * because tsconfig.functions.json includes only `functions/` — the same
 * boundary `KINDS` and the payload budgets are duplicated across.
 */

const STUDY_XP: Record<string, number> = {
  deck: 20,
  quiz: 25,
  weekly: 35,
  match: 10,
  anatomy: 15,
};

const STUDY_DAILY_CAP = 120;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** How far out of step with the server a client's clock may be and still count. */
const MAX_CLOCK_SKEW_MS = 48 * 60 * 60 * 1000;

interface Link {
  coupleId: string;
  memberId: string;
  timeZone: string;
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    // The study app is deployed to more than one host and has no fixed origin
    // worth pinning; the token is what grants access, not the origin. Echoed
    // rather than '*' so a browser will send the Authorization header at all.
    'access-control-allow-origin': origin ?? '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function reply(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });

async function linkFor(request: Request, env: Env): Promise<Link | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT couple_id, member_id, time_zone FROM study_tokens
      WHERE token_hash = ? AND revoked_at IS NULL`,
  )
    .bind(await hashToken(token))
    .first<{ couple_id: string; member_id: string; time_zone: string }>();
  return row ? { coupleId: row.couple_id, memberId: row.member_id, timeZone: row.time_zone } : null;
}

/** `en-CA` formats as YYYY-MM-DD, which is the shape every day key here uses. */
function dayKeyIn(at: number, timeZone: string): string {
  try {
    return new Date(at).toLocaleDateString('en-CA', { timeZone });
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = request.headers.get('origin');

  const link = await linkFor(request, env);
  if (!link) return reply({ error: 'this study link is not valid' }, 401, origin);

  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: unknown;
    kind?: unknown;
    at?: unknown;
  };

  const sessionId = body.sessionId;
  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    return reply({ error: 'sessionId required' }, 400, origin);
  }
  const kind = typeof body.kind === 'string' ? body.kind : '';
  const worth = STUDY_XP[kind];
  if (worth === undefined) return reply({ error: `unknown kind: ${kind}` }, 400, origin);

  const serverNow = Date.now();
  // The study app queues offline, so a session can legitimately be hours old.
  // Anything further out is a broken clock, and dating it by that would put the
  // gain on the wrong day — so it is accepted and dated by the server instead.
  const claimed = typeof body.at === 'number' && Number.isFinite(body.at) ? body.at : serverNow;
  const at = Math.abs(serverNow - claimed) > MAX_CLOCK_SKEW_MS ? serverNow : claimed;

  const day = dayKeyIn(at, link.timeZone);
  const awardId = `study-${sessionId}`;

  // The ledger's primary key is what makes a replay free: the same session
  // produces the same award id, and the insert below is IGNOREd the second time.
  const already = await env.DB.prepare(
    'SELECT 1 AS seen FROM pet_xp_awards WHERE couple_id = ? AND id = ?',
  )
    .bind(link.coupleId, awardId)
    .first<{ seen: number }>();
  if (already) {
    await touch(env, link, serverNow);
    return reply({ ok: true, xp: 0, duplicate: true, day }, 200, origin);
  }

  const spent = await env.DB.prepare('SELECT xp FROM study_days WHERE member_id = ? AND day = ?')
    .bind(link.memberId, day)
    .first<{ xp: number }>();
  // Clamped rather than refused: a session that lands on the ceiling should
  // still count for whatever is left, and the study app should not have to know
  // the ceiling exists.
  const gain = Math.max(0, Math.min(worth, STUDY_DAILY_CAP - (spent?.xp ?? 0)));

  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO pet_xp_awards (couple_id, id, member_id, amount, credited, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    ).bind(link.coupleId, awardId, link.memberId, gain, serverNow),
    env.DB.prepare(
      `INSERT INTO study_days (member_id, day, xp, sessions) VALUES (?, ?, ?, 1)
       ON CONFLICT(member_id, day) DO UPDATE SET xp = xp + excluded.xp, sessions = sessions + 1`,
    ).bind(link.memberId, day, gain),
    env.DB.prepare('UPDATE study_tokens SET last_used_at = ? WHERE member_id = ?')
      .bind(serverNow, link.memberId),
  ]);

  // Deliberately *not* credited into `pets` here. /api/pet owns that read-modify
  // -write and does it in one transaction with the marking; crediting from two
  // places is how a shared bar ends up counting an award twice. The gain lands
  // on the pet the next time either phone syncs, which is within the minute.
  return reply({ ok: true, xp: gain, day, cappedAt: STUDY_DAILY_CAP }, 200, origin);
};

async function touch(env: Env, link: Link, now: number): Promise<void> {
  await env.DB.prepare('UPDATE study_tokens SET last_used_at = ? WHERE member_id = ?')
    .bind(now, link.memberId)
    .run();
}
