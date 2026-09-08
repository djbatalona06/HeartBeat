/**
 * Shared plumbing for the Pages Functions.
 *
 * The token scheme here is deliberately identical to worker/src/index.ts: the
 * same SHA-256-of-bearer compared against members.token_hash, against the same
 * D1 database. A device pairs once and the token it gets works against both
 * surfaces, so which one serves a given route stays an implementation detail
 * rather than something the client has to know about.
 *
 * Files prefixed with _ are not routed by Pages, so this is a module and not
 * an endpoint.
 */

export interface Env {
  DB: D1Database;
  AI: Ai;
  /**
   * Photographs. Optional so a deploy that predates the bucket still starts and
   * serves everything else; /api/media answers 503 rather than throwing, and
   * the legacy data-URI path still renders whatever is already in D1.
   */
  MEDIA?: R2Bucket;
  /**
   * The VAPID *public* key, served to the browser by /api/health.
   *
   * Optional because a deploy without push configured must still start; the
   * client treats its absence as "notifications are not available here" rather
   * than as an error. The private half is never in this interface, and never
   * leaves the Worker.
   */
  VAPID_PUBLIC_KEY?: string;
}

export interface Caller {
  memberId: string;
  coupleId: string;
}

/** Tokens are stored hashed: a leaked database should not be a set of logins. */
export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Short, human-readable, and single-use — meant to be typed if a link fails. */
export function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

export async function authenticate(request: Request, env: Env): Promise<Caller | null> {
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

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // These functions are served from the app's own origin, so there is no
    // CORS preflight to answer and no allow-list to get wrong.
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** The invite window, matched to the Worker's. */
export const INVITE_TTL_MS = 15 * 60 * 1000;

/**
 * The record of who paired, who was turned away, and who was revoked.
 *
 * Kept identical in shape to worker/src/audit.ts, for the same reason the token
 * scheme is: which surface served a request should stay an implementation
 * detail, and a log that only covers half of them is not a log.
 *
 * Deliberately thin. No IP address, no raw user agent, no invite code — a
 * couple's private app should not grow a table more sensitive than the data it
 * was added to protect. Cloudflare resolves the country at the edge, and the
 * user agent is truncated to a hash that tells two devices apart without
 * describing either.
 */

export type AuthEventKind =
  | 'pair_start'
  | 'pair_join'
  | 'join_refused'
  | 'revoke'
  | 'token_rejected';

const UA_HASH_CHARS = 12;
const MAX_DETAIL = 120;

export interface AuthEvent {
  kind: AuthEventKind;
  coupleId?: string | null;
  memberId?: string | null;
  detail?: string;
}

async function uaHash(ua: string): Promise<string> {
  if (!ua) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ua));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, UA_HASH_CHARS);
}

/**
 * Never throws. An audit write that could fail a pairing would be a logging
 * feature that breaks the thing it logs: a dropped row is a worse record, a
 * dropped pairing is a broken app.
 */
export async function recordAuthEvent(
  db: D1Database,
  request: Request,
  event: AuthEvent,
  now: number,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO auth_events (id, couple_id, member_id, kind, detail, country, ua_hash, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        event.coupleId ?? null,
        event.memberId ?? null,
        event.kind,
        (event.detail ?? '').slice(0, MAX_DETAIL),
        request.headers.get('cf-ipcountry') ?? '',
        await uaHash(request.headers.get('user-agent') ?? ''),
        now,
      )
      .run();
  } catch (error) {
    console.error('audit write failed', error);
  }
}
