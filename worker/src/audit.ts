/**
 * The record of who paired, who was turned away, and who was revoked.
 *
 * There was no audit trail at all before this: the third-join refusal was
 * enforced in code and left no trace, so "did that actually get refused?" could
 * only be answered by reading the source and trusting it.
 *
 * What is deliberately *not* recorded matters as much as what is. No IP
 * address, no raw user agent, no invite code. A couple's private app should not
 * grow a table that is more sensitive than the data it was added to protect —
 * so this keeps a country, which Cloudflare hands over anyway, and a truncated
 * hash of the user agent, which distinguishes two devices without describing
 * either.
 */

export type AuthEventKind =
  | 'pair_start'
  | 'pair_join'
  | 'join_refused'
  | 'revoke'
  | 'token_rejected';

/** Long enough to tell two devices apart, short enough not to be a fingerprint. */
const UA_HASH_CHARS = 12;
const MAX_DETAIL = 120;

/** Anything with a `prepare` that binds and runs — D1, or SQLite in a test. */
export interface AuditDb {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
}

export interface AuthEvent {
  kind: AuthEventKind;
  coupleId?: string | null;
  memberId?: string | null;
  detail?: string;
}

export async function uaHash(ua: string): Promise<string> {
  if (!ua) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ua));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, UA_HASH_CHARS);
}

/**
 * Cloudflare resolves the country at the edge, so nothing has to be derived
 * from an address here — the address itself is never read, let alone stored.
 */
export function countryOf(request: Request): string {
  return request.headers.get('cf-ipcountry') ?? '';
}

/**
 * Never throws and never rejects.
 *
 * An audit write that could fail a pairing would be a logging feature that
 * breaks the thing it logs. A dropped row is a worse record; a dropped pairing
 * is a broken app.
 */
export async function recordAuthEvent(
  db: AuditDb,
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
        countryOf(request),
        await uaHash(request.headers.get('user-agent') ?? ''),
        now,
      )
      .run();
  } catch (error) {
    console.error('audit write failed', error);
  }
}
