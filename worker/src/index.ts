import { corsHeaders, resolveAllowedOrigin } from './cors';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}

const INVITE_TTL_MS = 15 * 60 * 1000;

/** Tokens are stored hashed: a leaked database should not be a set of logins. */
async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Short, human-readable, and single-use — meant to be typed if a link fails. */
function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

interface Caller {
  memberId: string;
  coupleId: string;
}

async function authenticate(request: Request, env: Env): Promise<Caller | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const row = await env.DB.prepare('SELECT id, couple_id FROM members WHERE token_hash = ?')
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

    // Start a couple. The first device calls this and keeps the token.
    if (url.pathname === '/pair/start' && request.method === 'POST') {
      const now = Date.now();
      const coupleId = crypto.randomUUID();
      const memberId = crypto.randomUUID();
      const token = newToken();
      const invite = newInviteCode();

      await env.DB.batch([
        env.DB.prepare('INSERT INTO couples (id, created_at) VALUES (?, ?)').bind(coupleId, now),
        env.DB.prepare(
          'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(memberId, coupleId, await hashToken(token), now, now),
        env.DB.prepare(
          'INSERT INTO invites (token, couple_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        ).bind(invite, coupleId, now, now + INVITE_TTL_MS),
        env.DB.prepare('INSERT INTO pets (couple_id, fed_at) VALUES (?, ?)').bind(coupleId, now),
      ]);

      return json({ coupleId, memberId, token, invite }, 200, origin);
    }

    // Redeem an invite. The second device calls this and gets its own token.
    if (url.pathname === '/pair/join' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { invite?: string };
      const code = (body.invite ?? '').trim().toUpperCase();
      if (!code) return json({ error: 'invite required' }, 400, origin);

      const now = Date.now();
      const row = await env.DB.prepare(
        'SELECT couple_id, expires_at, consumed_at FROM invites WHERE token = ?',
      )
        .bind(code)
        .first<{ couple_id: string; expires_at: number; consumed_at: number | null }>();

      if (!row) return json({ error: 'no such invite' }, 404, origin);
      if (row.consumed_at) return json({ error: 'invite already used' }, 409, origin);
      if (row.expires_at < now) return json({ error: 'invite expired' }, 410, origin);

      const existing = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM members WHERE couple_id = ?',
      )
        .bind(row.couple_id)
        .first<{ n: number }>();
      // Two people, by definition. A third join would silently widen who can
      // read the couple's data.
      if ((existing?.n ?? 0) >= 2) return json({ error: 'this couple is full' }, 409, origin);

      const memberId = crypto.randomUUID();
      const token = newToken();
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO members (id, couple_id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(memberId, row.couple_id, await hashToken(token), now, now),
        env.DB.prepare('UPDATE invites SET consumed_at = ? WHERE token = ?').bind(now, code),
      ]);

      return json({ coupleId: row.couple_id, memberId, token }, 200, origin);
    }

    const caller = await authenticate(request, env);
    if (!caller) return json({ error: 'unauthorized' }, 401, origin);

    // Push registration for this device.
    if (url.pathname === '/subscribe' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        endpoint?: string; p256dh?: string; auth?: string;
      };
      if (!body.endpoint || !body.p256dh || !body.auth) {
        return json({ error: 'endpoint, p256dh and auth are required' }, 400, origin);
      }
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO push_subscriptions (endpoint, member_id, p256dh, auth, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET
           member_id = excluded.member_id, p256dh = excluded.p256dh,
           auth = excluded.auth, updated_at = excluded.updated_at`,
      ).bind(body.endpoint, caller.memberId, body.p256dh, body.auth, now, now).run();
      return json({ ok: true }, 200, origin);
    }

    // Push the caller's own entries. Last write wins on updated_at.
    if (url.pathname === '/entries' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        entries?: Array<{ id: string; kind: string; day: string; payload: unknown; updatedAt: number }>;
      };
      const entries = body.entries ?? [];
      if (!entries.length) return json({ ok: true, written: 0 }, 200, origin);

      const statements = entries.map((e) =>
        env.DB.prepare(
          `INSERT INTO entries (id, couple_id, member_id, kind, day, payload, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(member_id, kind, day) DO UPDATE SET
             payload = excluded.payload, updated_at = excluded.updated_at
           WHERE excluded.updated_at > entries.updated_at`,
        ).bind(
          e.id, caller.coupleId, caller.memberId, e.kind, e.day,
          JSON.stringify(e.payload), e.updatedAt,
        ),
      );
      await env.DB.batch(statements);
      return json({ ok: true, written: entries.length }, 200, origin);
    }

    // Pull everything in the couple changed since `since`, both members.
    if (url.pathname === '/entries' && request.method === 'GET') {
      const since = Number(url.searchParams.get('since') ?? 0) || 0;
      const rows = await env.DB.prepare(
        `SELECT id, member_id, kind, day, payload, updated_at
           FROM entries WHERE couple_id = ? AND updated_at > ?
          ORDER BY updated_at ASC LIMIT 500`,
      )
        .bind(caller.coupleId, since)
        .all<{ id: string; member_id: string; kind: string; day: string; payload: string; updated_at: number }>();

      return json(
        {
          entries: rows.results.map((r) => ({
            id: r.id, memberId: r.member_id, kind: r.kind, day: r.day,
            payload: JSON.parse(r.payload), updatedAt: r.updated_at,
          })),
        },
        200,
        origin,
      );
    }

    return json({ error: 'not found' }, 404, origin);
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    // Delivery is the next piece of work; see docs/DESIGN.md. Until Web Push is
    // wired up, expire stale invites so a leaked link cannot be redeemed late.
    await env.DB.prepare('DELETE FROM invites WHERE expires_at < ? AND consumed_at IS NULL')
      .bind(Date.now())
      .run();
  },
};
