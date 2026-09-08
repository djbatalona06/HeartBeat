/**
 * Web Push, written against WebCrypto.
 *
 * The `web-push` npm package is Node-only — it reaches for `crypto.createECDH`
 * and `Buffer` — so it cannot run on Workers. What it does is not large, and
 * all of it has a WebCrypto equivalent, so it is done here directly:
 *
 *   - VAPID (RFC 8292): an ES256 JWT identifying this server to the push
 *     service, sent as `Authorization: vapid t=<jwt>, k=<public key>`.
 *   - aes128gcm (RFC 8291 over RFC 8188): ECDH against the subscriber's
 *     `p256dh`, two HKDF stages down to a content-encryption key and a nonce,
 *     AES-128-GCM, wrapped in a single aes128gcm record.
 *
 * The two RFC-8291 §5 vectors are pinned in `push.test.ts`, which is what makes
 * this safe to touch.
 */

/**
 * The ECDH algorithm object, with the peer key under the name every engine
 * actually reads.
 *
 * `@cloudflare/workers-types` declares this property as `$public` — an artifact
 * of the generator that builds those types, not something the runtime answers
 * to. Both the Workers runtime and the Node WebCrypto the tests run against
 * take the standard `public` from RFC-adjacent WebCrypto. Writing `$public` to
 * satisfy the compiler would derive a shared secret from `undefined` and fail
 * at the far end of an encrypted payload, which is the worst place to find out.
 */
export function ecdhWith(peer: CryptoKey): SubtleCryptoDeriveKeyAlgorithm {
  return { name: 'ECDH', public: peer } as unknown as SubtleCryptoDeriveKeyAlgorithm;
}

/** RFC 8188 record header: salt(16) + rs(4) + idlen(1) + the sender key(65). */
export const AES128GCM_HEADER_BYTES = 16 + 4 + 1 + 65;

/**
 * Every push service caps a request body at 4096 octets. What is left for the
 * plaintext is that, minus the record header, minus the GCM tag, minus the one
 * byte of padding delimiter.
 */
export const MAX_PAYLOAD_BYTES = 4096 - AES128GCM_HEADER_BYTES - 16 - 1;

/** The record size written into the header. One record, so: the whole budget. */
const RECORD_SIZE = 4096;

/** Twelve hours. RFC 8292 caps `exp` at 24; half that leaves room for skew. */
const VAPID_TTL_SECONDS = 12 * 60 * 60;

/** How long a push service should hold an undelivered nudge. */
export const PUSH_TTL_SECONDS = 60 * 60;

/** What `app/src/pwa/sw.ts` reads out of `event.data.json()`. */
export interface PushBody {
  title?: string;
  body?: string;
  path?: string;
  tag?: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class PushError extends Error {}

/* -- bytes ---------------------------------------------------------------- */

export function base64UrlToBytes(value: string): Uint8Array {
  const normal = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normal + '='.repeat((4 - (normal.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: spreading a large array into `String.fromCharCode` blows the
  // argument limit, and push payloads are allowed to be kilobytes.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** A view WebCrypto will accept: never a SharedArrayBuffer-backed one. */
function buffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(new ArrayBuffer(bytes.length));
  copy.set(bytes);
  return copy.buffer;
}

const utf8 = new TextEncoder();

/* -- P-256 keys ----------------------------------------------------------- */

/**
 * `crypto.subtle.importKey` cannot take a bare private scalar: a JWK needs `d`
 * *and* the public coordinates, and PKCS8 needs full DER. Rather than
 * implementing point multiplication to recover the public key from the scalar,
 * this takes the two secrets the deploy already sets — `VAPID_PUBLIC_KEY` (the
 * uncompressed point) and `VAPID_PRIVATE_KEY` (the scalar) — and assembles the
 * JWK from both. The documented secret format is therefore unchanged.
 *
 * WebCrypto checks that the point really is the scalar's public key, so a
 * mismatched pair fails loudly at import rather than signing garbage.
 */
export function p256Jwk(publicPoint: Uint8Array, privateScalar?: Uint8Array): JsonWebKey {
  if (publicPoint.length !== 65 || publicPoint[0] !== 0x04) {
    throw new PushError('expected a 65-byte uncompressed P-256 point');
  }
  if (privateScalar && privateScalar.length !== 32) {
    throw new PushError('expected a 32-byte P-256 private scalar');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(publicPoint.subarray(1, 33)),
    y: bytesToBase64Url(publicPoint.subarray(33, 65)),
    ...(privateScalar ? { d: bytesToBase64Url(privateScalar) } : {}),
    ext: true,
  };
}

/** VAPID configuration, with the signing key imported once per drain. */
export interface Vapid {
  subject: string;
  /** base64url uncompressed point — travels verbatim in the `k=` parameter. */
  publicKey: string;
  signingKey: CryptoKey;
}

export async function prepareVapid(config: {
  subject: string;
  publicKey?: string;
  privateKey?: string;
}): Promise<Vapid | null> {
  if (!config.publicKey || !config.privateKey || !config.subject) return null;
  const jwk = p256Jwk(base64UrlToBytes(config.publicKey), base64UrlToBytes(config.privateKey));
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return { subject: config.subject, publicKey: config.publicKey, signingKey };
}

/* -- VAPID (RFC 8292) ----------------------------------------------------- */

/**
 * `aud` is the *origin* of the endpoint, not the endpoint: a JWT scoped to one
 * subscription URL would leak which device is being pushed to.
 */
export function audienceOf(endpoint: string): string {
  return new URL(endpoint).origin;
}

/**
 * The signed half of the `Authorization` header.
 *
 * `crypto.subtle.sign('ECDSA', …)` returns raw P1363 `r‖s` on Workers, which is
 * already what JWS wants — there is deliberately no DER unwrapping here.
 */
export async function vapidJwt(vapid: Vapid, audience: string, nowMs: number): Promise<string> {
  const header = bytesToBase64Url(utf8.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToBase64Url(
    utf8.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(nowMs / 1000) + VAPID_TTL_SECONDS,
        sub: vapid.subject,
      }),
    ),
  );
  const signed = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    vapid.signingKey,
    utf8.encode(signed),
  );
  return `${signed}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function vapidAuthorization(
  vapid: Vapid,
  endpoint: string,
  nowMs: number,
): Promise<string> {
  return `vapid t=${await vapidJwt(vapid, audienceOf(endpoint), nowMs)}, k=${vapid.publicKey}`;
}

/* -- aes128gcm (RFC 8291 / RFC 8188) -------------------------------------- */

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  lengthBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', buffer(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: buffer(salt), info: buffer(info) },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

export interface ContentKeys {
  cek: Uint8Array;
  nonce: Uint8Array;
}

/**
 * The RFC 8291 §3.4 ladder. Two extractions, not one: the first mixes the
 * subscription's `auth` secret into the ECDH output along with both public
 * keys, so the same shared secret cannot be replayed against another
 * subscription; the second is the ordinary RFC 8188 content-key derivation.
 */
export async function deriveContentKeys(input: {
  ecdhSecret: Uint8Array;
  authSecret: Uint8Array;
  uaPublic: Uint8Array;
  serverPublic: Uint8Array;
  salt: Uint8Array;
}): Promise<ContentKeys> {
  const keyInfo = concatBytes(
    utf8.encode('WebPush: info\0'),
    input.uaPublic,
    input.serverPublic,
  );
  const ikm = await hkdf(input.authSecret, input.ecdhSecret, keyInfo, 32);
  return {
    cek: await hkdf(input.salt, ikm, utf8.encode('Content-Encoding: aes128gcm\0'), 16),
    nonce: await hkdf(input.salt, ikm, utf8.encode('Content-Encoding: nonce\0'), 12),
  };
}

/** Seams so the tests can pin a vector instead of chasing fresh randomness. */
export interface EncryptOptions {
  salt?: Uint8Array;
  serverKeys?: CryptoKeyPair;
}

/** One aes128gcm record: header ‖ AES-128-GCM(plaintext ‖ 0x02). */
export async function encryptPayload(
  subscription: Pick<PushSubscriptionRecord, 'p256dh' | 'auth'>,
  plaintext: Uint8Array,
  options: EncryptOptions = {},
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PAYLOAD_BYTES) {
    throw new PushError(`push payload is ${plaintext.length} bytes; the limit is ${MAX_PAYLOAD_BYTES}`);
  }

  const uaPublic = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new PushError('subscription p256dh is not a 65-byte uncompressed P-256 point');
  }
  if (authSecret.length !== 16) {
    throw new PushError('subscription auth secret is not 16 bytes');
  }

  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const serverKeys =
    options.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);

  const uaKey = await crypto.subtle.importKey(
    'raw',
    buffer(uaPublic),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const serverPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', serverKeys.publicKey)) as ArrayBuffer,
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdhWith(uaKey), serverKeys.privateKey, 256),
  );

  const { cek, nonce } = await deriveContentKeys({
    ecdhSecret,
    authSecret,
    uaPublic,
    serverPublic,
    salt,
  });

  const contentKey = await crypto.subtle.importKey('raw', buffer(cek), 'AES-GCM', false, [
    'encrypt',
  ]);
  // 0x02 is RFC 8188's "last record" delimiter. There is only ever one record.
  const padded = concatBytes(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: buffer(nonce), tagLength: 128 },
      contentKey,
      buffer(padded),
    ),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE, false);
  return concatBytes(
    salt,
    recordSize,
    new Uint8Array([serverPublic.length]),
    serverPublic,
    ciphertext,
  );
}

/* -- sending -------------------------------------------------------------- */

export interface PushResult {
  status: number;
  /** 404 or 410: the subscription is dead and should be forgotten. */
  gone: boolean;
  ok: boolean;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<{ status: number }>;

export interface SendOptions extends EncryptOptions {
  nowMs?: number;
  ttlSeconds?: number;
  fetchImpl?: FetchLike;
}

export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushBody,
  vapid: Vapid,
  options: SendOptions = {},
): Promise<PushResult> {
  const body = await encryptPayload(subscription, utf8.encode(JSON.stringify(payload)), options);
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));

  const response = await doFetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorization(vapid, subscription.endpoint, options.nowMs ?? Date.now()),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(options.ttlSeconds ?? PUSH_TTL_SECONDS),
      urgency: 'normal',
    },
    body: buffer(body),
  });

  return {
    status: response.status,
    // 404 is "no such subscription", 410 is "it was unsubscribed". Either way
    // it will never come back, and retrying it every 60 seconds is forever.
    gone: response.status === 404 || response.status === 410,
    ok: response.status >= 200 && response.status < 300,
  };
}

/* -- the drain ------------------------------------------------------------ */

/** How many nudges one cron tick will attempt. The cron runs every minute. */
export const DRAIN_LIMIT = 20;

/** Delivered rows are kept a week so a duplicate key cannot resurrect one. */
const DELIVERED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

interface NudgeRow {
  key: string;
  member_id: string;
  title: string;
  body: string;
  path: string;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface DrainSummary {
  /** Nudges this tick claimed — i.e. whose `delivered_at` this tick set. */
  claimed: number;
  sent: number;
  failed: number;
  /** Subscriptions dropped because the push service said 404/410. */
  removed: number;
}

export interface DrainOptions extends EncryptOptions {
  nowMs?: number;
  limit?: number;
  fetchImpl?: FetchLike;
  onError?: (message: string, error: unknown) => void;
}

/**
 * Deliver everything due and mark it delivered.
 *
 * `nudgePartner` is not the only writer — reminders arrive from the phone with
 * arbitrary keys, future `fire_at`s and paths other than `/boss` — so nothing
 * here reads meaning into a row beyond the four fields the notification needs.
 *
 * The claim (`SET delivered_at … WHERE delivered_at IS NULL`) happens *before*
 * the send, and a row is skipped when it changed nothing. The cron fires every
 * minute; a send that outlives its tick must not be sent twice by the next one.
 * The cost is that a push service having a bad minute drops that nudge rather
 * than retrying it, which for a reminder is the better failure: a nudge that
 * arrives an hour late is worse than one that does not arrive.
 */
export async function drainNudges(
  db: D1Database,
  vapid: Vapid,
  options: DrainOptions = {},
): Promise<DrainSummary> {
  const now = options.nowMs ?? Date.now();
  const limit = options.limit ?? DRAIN_LIMIT;
  const report = options.onError ?? (() => {});
  const summary: DrainSummary = { claimed: 0, sent: 0, failed: 0, removed: 0 };

  const due = await db
    .prepare(
      `SELECT key, member_id, title, body, path
         FROM scheduled_nudges
        WHERE delivered_at IS NULL AND fire_at <= ?
        ORDER BY fire_at ASC
        LIMIT ?`,
    )
    .bind(now, limit)
    .all<NudgeRow>();

  for (const row of due.results ?? []) {
    // `changes === 0` means another tick got there first. `undefined` means a
    // driver that does not report it, which is not a reason to skip the send.
    const claim = await db
      .prepare('UPDATE scheduled_nudges SET delivered_at = ? WHERE key = ? AND delivered_at IS NULL')
      .bind(now, row.key)
      .run();
    if (claim.meta?.changes === 0) continue;
    summary.claimed += 1;

    let subscriptions: SubscriptionRow[] = [];
    try {
      const found = await db
        .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ?')
        .bind(row.member_id)
        .all<SubscriptionRow>();
      subscriptions = found.results ?? [];
    } catch (error) {
      report(`could not load subscriptions for ${row.member_id}`, error);
      continue;
    }

    const payload: PushBody = {
      title: row.title,
      body: row.body,
      path: row.path,
      // The row key is the collapse key: a re-sent nudge replaces the old
      // notification on the phone instead of stacking a second copy.
      tag: row.key,
    };

    // A phone with a stale endpoint must not stop the other phone being told.
    const results = await Promise.allSettled(
      subscriptions.map((subscription) => sendPush(subscription, payload, vapid, options)),
    );

    for (let i = 0; i < results.length; i += 1) {
      const result = results[i]!;
      const endpoint = subscriptions[i]!.endpoint;
      if (result.status === 'rejected') {
        summary.failed += 1;
        report(`push failed for ${endpoint}`, result.reason);
        continue;
      }
      if (result.value.gone) {
        summary.removed += 1;
        try {
          await db
            .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
            .bind(endpoint)
            .run();
        } catch (error) {
          report(`could not drop dead subscription ${endpoint}`, error);
        }
        continue;
      }
      if (result.value.ok) summary.sent += 1;
      else {
        summary.failed += 1;
        report(`push returned ${result.value.status} for ${endpoint}`, null);
      }
    }
  }

  await db
    .prepare('DELETE FROM scheduled_nudges WHERE delivered_at IS NOT NULL AND delivered_at < ?')
    .bind(now - DELIVERED_RETENTION_MS)
    .run();

  return summary;
}
