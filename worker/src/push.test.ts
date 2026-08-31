import { describe, expect, it } from 'vitest';
import {
  AES128GCM_HEADER_BYTES,
  DRAIN_LIMIT,
  MAX_PAYLOAD_BYTES,
  PUSH_TTL_SECONDS,
  PushError,
  audienceOf,
  base64UrlToBytes,
  bytesToBase64Url,
  deriveContentKeys,
  drainNudges,
  ecdhWith,
  encryptPayload,
  p256Jwk,
  prepareVapid,
  sendPush,
  vapidJwt,
  type FetchLike,
  type PushSubscriptionRecord,
  type Vapid,
} from './push';

/**
 * Every key in this file is a published RFC test vector or a throwaway pair
 * generated for the suite. None of them is a real HeartBeat secret, and none
 * of them ever leaves this file.
 */

/* -- RFC 8291 section 5 --------------------------------------------------- */

const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  serverPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  serverPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  ecdhSecret: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLoc' +
    'InmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLV' +
    'WGNWQexSgSxsj_Qulcy4a-fN',
};

/** The RFC gives the sender key as a bare scalar; `p256Jwk` is what rebuilds it. */
async function rfcServerKeys(): Promise<CryptoKeyPair> {
  const jwk = p256Jwk(base64UrlToBytes(RFC.serverPublic), base64UrlToBytes(RFC.serverPrivate));
  const { d: _d, ...publicJwk } = jwk;
  return {
    privateKey: await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    ),
    publicKey: await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    ),
  };
}

describe('base64url', () => {
  it('round-trips and never emits padding or the URL-hostile alphabet', () => {
    const bytes = new Uint8Array([0, 1, 251, 252, 253, 254, 255, 62, 63]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect([...base64UrlToBytes(encoded)]).toEqual([...bytes]);
  });

  it('decodes an unpadded vector to its documented length', () => {
    expect(base64UrlToBytes(RFC.uaPublic)).toHaveLength(65);
    expect(base64UrlToBytes(RFC.authSecret)).toHaveLength(16);
    expect(base64UrlToBytes(RFC.salt)).toHaveLength(16);
  });

  it('survives a payload longer than the String.fromCharCode argument limit', () => {
    const big = new Uint8Array(70_000).map((_, i) => i % 256);
    expect([...base64UrlToBytes(bytesToBase64Url(big))]).toEqual([...big]);
  });
});

describe('p256Jwk', () => {
  it('splits an uncompressed point into x and y', () => {
    const jwk = p256Jwk(base64UrlToBytes(RFC.serverPublic), base64UrlToBytes(RFC.serverPrivate));
    expect(jwk.crv).toBe('P-256');
    expect(base64UrlToBytes(jwk.x!)).toHaveLength(32);
    expect(base64UrlToBytes(jwk.y!)).toHaveLength(32);
    expect(jwk.d).toBe(RFC.serverPrivate);
  });

  it('rejects anything that is not a 65-byte uncompressed point', () => {
    expect(() => p256Jwk(new Uint8Array(64))).toThrow(PushError);
    // A compressed point (0x02/0x03 prefix) is the plausible mistake.
    const compressed = new Uint8Array(65);
    compressed[0] = 0x02;
    expect(() => p256Jwk(compressed)).toThrow(PushError);
  });

  it('rejects a private scalar of the wrong length', () => {
    expect(() => p256Jwk(base64UrlToBytes(RFC.serverPublic), new Uint8Array(31))).toThrow(PushError);
  });
});

describe('RFC 8291 section 5', () => {
  it('derives the published content-encryption key and nonce', async () => {
    const keys = await deriveContentKeys({
      ecdhSecret: base64UrlToBytes(RFC.ecdhSecret),
      authSecret: base64UrlToBytes(RFC.authSecret),
      uaPublic: base64UrlToBytes(RFC.uaPublic),
      serverPublic: base64UrlToBytes(RFC.serverPublic),
      salt: base64UrlToBytes(RFC.salt),
    });
    expect(bytesToBase64Url(keys.cek)).toBe(RFC.cek);
    expect(bytesToBase64Url(keys.nonce)).toBe(RFC.nonce);
  });

  it('produces the published record, byte for byte', async () => {
    const body = await encryptPayload(
      { p256dh: RFC.uaPublic, auth: RFC.authSecret },
      new TextEncoder().encode(RFC.plaintext),
      { salt: base64UrlToBytes(RFC.salt), serverKeys: await rfcServerKeys() },
    );
    expect(bytesToBase64Url(body)).toBe(RFC.body);
  });

  it('lays the record header out as salt(16) ‖ rs(4) ‖ idlen(1) ‖ key(65)', async () => {
    const body = base64UrlToBytes(RFC.body);
    expect([...body.subarray(0, 16)]).toEqual([...base64UrlToBytes(RFC.salt)]);
    // rs is 4096 big-endian, then the 65-byte key id length.
    expect(new DataView(body.buffer, body.byteOffset).getUint32(16, false)).toBe(4096);
    expect(body[20]).toBe(65);
    expect(bytesToBase64Url(body.subarray(21, 86))).toBe(RFC.serverPublic);
    expect(AES128GCM_HEADER_BYTES).toBe(86);
    // plaintext + 0x02 delimiter + 16-byte GCM tag.
    expect(body.length).toBe(86 + RFC.plaintext.length + 1 + 16);
  });
});

describe('encryptPayload', () => {
  const sub = { p256dh: RFC.uaPublic, auth: RFC.authSecret };

  it('is different every time with a fresh salt and ephemeral key', async () => {
    const plaintext = new TextEncoder().encode('hello');
    const a = await encryptPayload(sub, plaintext);
    const b = await encryptPayload(sub, plaintext);
    expect(bytesToBase64Url(a)).not.toBe(bytesToBase64Url(b));
    expect(a.length).toBe(b.length);
  });

  it('refuses a payload that would overflow the 4096-byte body', async () => {
    expect(MAX_PAYLOAD_BYTES).toBe(4096 - 86 - 16 - 1);
    await expect(encryptPayload(sub, new Uint8Array(MAX_PAYLOAD_BYTES + 1))).rejects.toThrow(PushError);
    await expect(encryptPayload(sub, new Uint8Array(MAX_PAYLOAD_BYTES))).resolves.toHaveLength(4096);
  });

  it('rejects a malformed subscription rather than sending undecryptable bytes', async () => {
    const plaintext = new TextEncoder().encode('hi');
    await expect(encryptPayload({ p256dh: 'AAAA', auth: RFC.authSecret }, plaintext)).rejects.toThrow(
      /uncompressed P-256 point/,
    );
    await expect(encryptPayload({ p256dh: RFC.uaPublic, auth: 'AAAA' }, plaintext)).rejects.toThrow(
      /auth secret/,
    );
  });
});

/* -- VAPID ---------------------------------------------------------------- */

/**
 * A throwaway P-256 pair, generated once for the suite. Obviously not a secret.
 *
 * It has to be a *real* pair: WebCrypto derives the public point from `d` on
 * import and rejects a JWK whose `x`/`y` do not match, so invented values fail
 * with `Invalid JWK EC key` long before any signing happens.
 */
const TEST_VAPID = {
  publicKey:
    'BEEsIVpHYAMhwcuizn17YScXQEXqLFb6QhGZo-RIniFRgnj4KeBaZVAlir36QiJeq00_hSvmM_L_TfqdH2r-vHU',
  privateKey: 'bUgGj_JUaHFbIo4Bz98pnMBoWoKX746LDp9WzUtMwZ4',
};

async function testVapid(): Promise<Vapid> {
  const vapid = await prepareVapid({
    subject: 'mailto:someone@example.com',
    publicKey: TEST_VAPID.publicKey,
    privateKey: TEST_VAPID.privateKey,
  });
  if (!vapid) throw new Error('fixture keys did not import');
  return vapid;
}

function decodeJwtPart(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

describe('prepareVapid', () => {
  it('is null when either key is unset, so a keyless deploy is a no-op', async () => {
    const base = { subject: 'mailto:a@b.c', ...TEST_VAPID };
    await expect(prepareVapid({ ...base, publicKey: undefined })).resolves.toBeNull();
    await expect(prepareVapid({ ...base, privateKey: undefined })).resolves.toBeNull();
    await expect(prepareVapid({ ...base, subject: '' })).resolves.toBeNull();
  });

  it('rejects a public key that is not this private key', async () => {
    // The whole reason the JWK carries both halves: WebCrypto checks the point.
    await expect(
      prepareVapid({
        subject: 'mailto:a@b.c',
        publicKey: RFC.serverPublic,
        privateKey: TEST_VAPID.privateKey,
      }),
    ).rejects.toThrow();
  });
});

describe('the VAPID JWT', () => {
  const NOW = 1_700_000_000_000;

  it('pins the ES256 header', async () => {
    const [header] = (await vapidJwt(await testVapid(), 'https://push.example', NOW)).split('.');
    expect(header).toBe('eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9');
    expect(decodeJwtPart(header!)).toEqual({ typ: 'JWT', alg: 'ES256' });
  });

  it('claims the endpoint origin, a 12-hour expiry, and the subject', async () => {
    const [, claims] = (await vapidJwt(await testVapid(), 'https://push.example', NOW)).split('.');
    expect(decodeJwtPart(claims!)).toEqual({
      aud: 'https://push.example',
      exp: NOW / 1000 + 12 * 60 * 60,
      sub: 'mailto:someone@example.com',
    });
  });

  it('audiences the origin, never the subscription URL', () => {
    // A JWT naming the full endpoint would hand every push service the id of
    // the device it is for.
    expect(audienceOf('https://fcm.googleapis.com/fcm/send/abc123?x=1')).toBe(
      'https://fcm.googleapis.com',
    );
  });

  it('signs raw P1363 r‖s that verifies against the public key', async () => {
    const vapid = await testVapid();
    const jwt = await vapidJwt(vapid, 'https://push.example', NOW);
    const [header, claims, signature] = jwt.split('.');
    const raw = base64UrlToBytes(signature!);
    // 64 bytes, not a DER SEQUENCE — no unwrapping belongs in the signer.
    expect(raw).toHaveLength(64);
    expect(raw[0]).not.toBe(0x30);

    const verifyKey = await crypto.subtle.importKey(
      'jwk',
      p256Jwk(base64UrlToBytes(TEST_VAPID.publicKey)),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      raw,
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(ok).toBe(true);
  });
});

describe('sendPush', () => {
  const subscription: PushSubscriptionRecord = {
    endpoint: 'https://push.example/sub/one',
    p256dh: RFC.uaPublic,
    auth: RFC.authSecret,
  };

  function recorder(status = 201) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return { status };
    };
    return { calls, fetchImpl };
  }

  it('POSTs an aes128gcm body with a vapid Authorization header', async () => {
    const { calls, fetchImpl } = recorder();
    const result = await sendPush(
      subscription,
      { title: 'Ready when you are', body: 'The other half said ready.', path: '/boss' },
      await testVapid(),
      { fetchImpl, nowMs: 1_700_000_000_000 },
    );

    expect(result).toEqual({ status: 201, gone: false, ok: true });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(subscription.endpoint);
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['content-encoding']).toBe('aes128gcm');
    expect(headers['content-type']).toBe('application/octet-stream');
    expect(headers['ttl']).toBe(String(PUSH_TTL_SECONDS));
    expect(headers['authorization']).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(headers['authorization']).toContain(`k=${TEST_VAPID.publicKey}`);

    // Encrypted, not JSON: the push service must not be able to read the copy.
    const body = new Uint8Array(init.body as ArrayBuffer);
    expect(body.length).toBeGreaterThan(AES128GCM_HEADER_BYTES);
    expect(new TextDecoder().decode(body)).not.toContain('Ready when you are');
  });

  it('sends exactly the four fields the service worker reads', async () => {
    const { calls, fetchImpl } = recorder();
    // Decrypting our own record end to end is the only honest check that the
    // shape in `app/src/pwa/sw.ts` is what actually lands on the phone.
    const uaKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(
      (await crypto.subtle.exportKey('raw', uaKeys.publicKey)) as ArrayBuffer,
    );
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const payload = { title: 'It is down', body: 'Tier 2 is finished.', path: '/boss', tag: 'boss:c:m' };

    await sendPush(
      { endpoint: subscription.endpoint, p256dh: bytesToBase64Url(uaPublic), auth: bytesToBase64Url(authSecret) },
      payload,
      await testVapid(),
      { fetchImpl },
    );

    const body = new Uint8Array(calls[0]!.init.body as ArrayBuffer);
    const salt = body.subarray(0, 16);
    const serverPublic = body.subarray(21, 86);
    const ciphertext = body.subarray(86);
    const serverKey = await crypto.subtle.importKey(
      'raw',
      serverPublic,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const ecdhSecret = new Uint8Array(
      await crypto.subtle.deriveBits(ecdhWith(serverKey), uaKeys.privateKey, 256),
    );
    const { cek, nonce } = await deriveContentKeys({
      ecdhSecret,
      authSecret,
      uaPublic,
      serverPublic,
      salt,
    });
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, tagLength: 128 },
        await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']),
        ciphertext,
      ),
    );
    expect(plain[plain.length - 1]).toBe(0x02);
    expect(JSON.parse(new TextDecoder().decode(plain.subarray(0, -1)))).toEqual(payload);
  });

  it.each([404, 410])('reports %i as gone', async (status) => {
    const { fetchImpl } = recorder(status);
    const result = await sendPush(subscription, { title: 'x' }, await testVapid(), { fetchImpl });
    expect(result.gone).toBe(true);
    expect(result.ok).toBe(false);
  });

  it('does not treat a 500 as gone — a bad minute is not a dead endpoint', async () => {
    const { fetchImpl } = recorder(500);
    const result = await sendPush(subscription, { title: 'x' }, await testVapid(), { fetchImpl });
    expect(result).toEqual({ status: 500, gone: false, ok: false });
  });
});

/* -- the drain ------------------------------------------------------------ */

interface FakeNudge {
  key: string;
  couple_id: string;
  member_id: string;
  fire_at: number;
  title: string;
  body: string;
  path: string;
  delivered_at: number | null;
}

/**
 * A D1 stand-in that understands only the handful of statements `drainNudges`
 * issues, matched on a distinctive fragment rather than parsed.
 */
function fakeDb(seed: { nudges: FakeNudge[]; subscriptions: PushSubscriptionRecord[] }) {
  const nudges = seed.nudges.map((n) => ({ ...n }));
  let subscriptions = seed.subscriptions.map((s) => ({ ...s }));
  const statements: string[] = [];

  const db = {
    prepare(query: string) {
      statements.push(query);
      return {
        bind(...args: unknown[]) {
          return {
            async all<T>() {
              if (query.includes('FROM scheduled_nudges')) {
                const [now, limit] = args as [number, number];
                const results = nudges
                  .filter((n) => n.delivered_at === null && n.fire_at <= now)
                  .sort((a, b) => a.fire_at - b.fire_at)
                  .slice(0, limit);
                return { results: results as unknown as T[] };
              }
              if (query.includes('FROM push_subscriptions')) {
                const [memberId] = args as [string];
                const owner = (endpoint: string) =>
                  nudges.find((n) => n.member_id === memberId) && endpoint;
                return {
                  results: subscriptions.filter((s) => owner(s.endpoint)) as unknown as T[],
                };
              }
              throw new Error(`unexpected query: ${query}`);
            },
            async run() {
              if (query.startsWith('UPDATE scheduled_nudges')) {
                const [deliveredAt, key] = args as [number, string];
                const row = nudges.find((n) => n.key === key && n.delivered_at === null);
                if (!row) return { meta: { changes: 0 } };
                row.delivered_at = deliveredAt;
                return { meta: { changes: 1 } };
              }
              if (query.startsWith('DELETE FROM push_subscriptions')) {
                const [endpoint] = args as [string];
                const before = subscriptions.length;
                subscriptions = subscriptions.filter((s) => s.endpoint !== endpoint);
                return { meta: { changes: before - subscriptions.length } };
              }
              if (query.startsWith('DELETE FROM scheduled_nudges')) {
                const [cutoff] = args as [number];
                let changes = 0;
                for (let i = nudges.length - 1; i >= 0; i -= 1) {
                  const row = nudges[i]!;
                  if (row.delivered_at !== null && row.delivered_at < cutoff) {
                    nudges.splice(i, 1);
                    changes += 1;
                  }
                }
                return { meta: { changes } };
              }
              throw new Error(`unexpected statement: ${query}`);
            },
          };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, nudges, statements, list: () => subscriptions };
}

const NOW = 1_700_000_000_000;

function nudge(over: Partial<FakeNudge> = {}): FakeNudge {
  return {
    key: 'boss:couple-1:member-2',
    couple_id: 'couple-1',
    member_id: 'member-2',
    fire_at: NOW - 1000,
    title: 'Ready when you are',
    body: 'The other half of the couple has said ready.',
    path: '/boss',
    delivered_at: null,
    ...over,
  };
}

function subscription(endpoint: string): PushSubscriptionRecord {
  return { endpoint, p256dh: RFC.uaPublic, auth: RFC.authSecret };
}

describe('drainNudges', () => {
  it('sends a due nudge to every one of the member’s devices', async () => {
    const store = fakeDb({
      nudges: [nudge()],
      subscriptions: [subscription('https://push.example/a'), subscription('https://push.example/b')],
    });
    const seen: string[] = [];

    const summary = await drainNudges(store.db, await testVapid(), {
      nowMs: NOW,
      fetchImpl: async (url) => {
        seen.push(url);
        return { status: 201 };
      },
    });

    expect(seen.sort()).toEqual(['https://push.example/a', 'https://push.example/b']);
    expect(summary).toEqual({ claimed: 1, sent: 2, failed: 0, removed: 0 });
  });

  it('sets delivered_at exactly once, even across overlapping ticks', async () => {
    const store = fakeDb({
      nudges: [nudge()],
      subscriptions: [subscription('https://push.example/a')],
    });
    const vapid = await testVapid();
    let sends = 0;
    const fetchImpl: FetchLike = async () => {
      sends += 1;
      return { status: 201 };
    };

    // The cron fires every minute; a slow send must not be delivered twice.
    const first = await drainNudges(store.db, vapid, { nowMs: NOW, fetchImpl });
    const second = await drainNudges(store.db, vapid, { nowMs: NOW + 60_000, fetchImpl });

    expect(first.claimed).toBe(1);
    expect(second.claimed).toBe(0);
    expect(sends).toBe(1);
    expect(store.nudges[0]!.delivered_at).toBe(NOW);
  });

  it('claims the row before the send, so a throwing send is not retried forever', async () => {
    const store = fakeDb({
      nudges: [nudge()],
      subscriptions: [subscription('https://push.example/a')],
    });
    const errors: string[] = [];

    const summary = await drainNudges(store.db, await testVapid(), {
      nowMs: NOW,
      fetchImpl: async () => {
        throw new Error('socket hang up');
      },
      onError: (message) => errors.push(message),
    });

    expect(summary).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    expect(store.nudges[0]!.delivered_at).toBe(NOW);
    expect(errors[0]).toContain('push failed');
  });

  it('deletes the subscription on 404 or 410 and keeps the healthy one', async () => {
    const store = fakeDb({
      nudges: [nudge()],
      subscriptions: [
        subscription('https://push.example/dead-404'),
        subscription('https://push.example/dead-410'),
        subscription('https://push.example/alive'),
      ],
    });

    const summary = await drainNudges(store.db, await testVapid(), {
      nowMs: NOW,
      fetchImpl: async (url) => ({
        status: url.endsWith('404') ? 404 : url.endsWith('410') ? 410 : 201,
      }),
    });

    expect(summary).toEqual({ claimed: 1, sent: 1, failed: 0, removed: 2 });
    expect(store.list().map((s) => s.endpoint)).toEqual(['https://push.example/alive']);
  });

  it('keeps a transient 500 subscription — only 404/410 are permanent', async () => {
    const store = fakeDb({
      nudges: [nudge()],
      subscriptions: [subscription('https://push.example/a')],
    });

    const summary = await drainNudges(store.db, await testVapid(), {
      nowMs: NOW,
      fetchImpl: async () => ({ status: 503 }),
      onError: () => {},
    });

    expect(summary).toMatchObject({ failed: 1, removed: 0 });
    expect(store.list()).toHaveLength(1);
  });

  it('lets one bad endpoint fail without aborting the rest of the drain', async () => {
    const store = fakeDb({
      nudges: [
        nudge({ key: 'a', fire_at: NOW - 3000 }),
        nudge({ key: 'b', fire_at: NOW - 2000 }),
        nudge({ key: 'c', fire_at: NOW - 1000 }),
      ],
      subscriptions: [subscription('https://push.example/a')],
    });
    let call = 0;

    const summary = await drainNudges(store.db, await testVapid(), {
      nowMs: NOW,
      fetchImpl: async () => {
        call += 1;
        if (call === 2) throw new Error('boom');
        return { status: 201 };
      },
      onError: () => {},
    });

    expect(summary).toMatchObject({ claimed: 3, sent: 2, failed: 1 });
    expect(store.nudges.every((n) => n.delivered_at === NOW)).toBe(true);
  });

  it('leaves a nudge whose fire_at is still in the future', async () => {
    // Unit 6 posts reminders hours ahead; the drain is the only thing holding
    // them back until they are due.
    const store = fakeDb({
      nudges: [nudge({ key: 'later', fire_at: NOW + 60 * 60 * 1000 })],
      subscriptions: [subscription('https://push.example/a')],
    });

    const summary = await drainNudges(store.db, await testVapid(), {
      nowMs: NOW,
      fetchImpl: async () => ({ status: 201 }),
    });

    expect(summary.claimed).toBe(0);
    expect(store.nudges[0]!.delivered_at).toBeNull();
  });

  it('carries an arbitrary key and path through, not just boss nudges', async () => {
    const store = fakeDb({
      nudges: [
        nudge({
          key: 'reminder:member-2:2026-08-31T07:00',
          title: 'Morning check-in',
          body: 'Whenever you are ready.',
          path: '/today',
        }),
      ],
      subscriptions: [subscription('https://push.example/a')],
    });

    let sent: PushSubscriptionRecord | null = null;
    await drainNudges(store.db, await testVapid(), {
      nowMs: NOW,
      // Reuse the RFC keys so the record decrypts deterministically.
      salt: base64UrlToBytes(RFC.salt),
      serverKeys: await rfcServerKeys(),
      fetchImpl: async (url) => {
        sent = subscription(url);
        return { status: 201 };
      },
    });
    expect(sent).not.toBeNull();
    // The tag is the row key, so a repeat replaces rather than stacks.
    expect(store.nudges[0]!.key).toBe('reminder:member-2:2026-08-31T07:00');
  });

  it('honours the batch limit so one tick cannot outrun the minute', async () => {
    const store = fakeDb({
      nudges: Array.from({ length: 5 }, (_, i) => nudge({ key: `n${i}`, fire_at: NOW - (5 - i) })),
      subscriptions: [subscription('https://push.example/a')],
    });

    const summary = await drainNudges(store.db, await testVapid(), {
      nowMs: NOW,
      limit: 2,
      fetchImpl: async () => ({ status: 201 }),
    });

    expect(summary.claimed).toBe(2);
    expect(store.nudges.filter((n) => n.delivered_at === null)).toHaveLength(3);
    expect(DRAIN_LIMIT).toBeGreaterThan(0);
  });

  it('sweeps delivered rows older than a week, and keeps recent ones', async () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const store = fakeDb({
      nudges: [
        nudge({ key: 'ancient', delivered_at: NOW - week - 1 }),
        nudge({ key: 'yesterday', delivered_at: NOW - 24 * 60 * 60 * 1000 }),
      ],
      subscriptions: [],
    });

    await drainNudges(store.db, await testVapid(), { nowMs: NOW, fetchImpl: async () => ({ status: 201 }) });

    expect(store.nudges.map((n) => n.key)).toEqual(['yesterday']);
  });

  it('marks a nudge delivered even when the member has no device registered', async () => {
    // Otherwise it is re-selected every 60 seconds for as long as it exists.
    const store = fakeDb({ nudges: [nudge()], subscriptions: [] });

    const summary = await drainNudges(store.db, await testVapid(), {
      nowMs: NOW,
      fetchImpl: async () => ({ status: 201 }),
    });

    expect(summary).toEqual({ claimed: 1, sent: 0, failed: 0, removed: 0 });
    expect(store.nudges[0]!.delivered_at).toBe(NOW);
  });
});
