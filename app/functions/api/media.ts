import { authenticate, json, type Env } from './_lib';

/**
 * Photographs, in and out of R2.
 *
 * They used to be base64 inside D1 — `entries.payload` for workout proof,
 * `members.photo_data_uri` for faces. D1 has a row-size ceiling and is not a
 * blob store, so months of gym photographs walk towards that ceiling while
 * making every unrelated query slower on the way.
 *
 * The bucket is **never public**. Both routes authenticate, and both compare
 * the couple segment of the key against the caller before touching R2, so one
 * couple cannot read another's photograph even holding a valid token. Making
 * the bucket public would have been a wider hole than the pairing perimeter
 * this app is built on.
 *
 * The key is the SHA-256 of the bytes, which the server recomputes rather than
 * trusts: a client that could name an object freely could overwrite one it does
 * not own, and content addressing only means anything if the content was
 * actually checked.
 *
 * Kept in step with app/src/domain/media/objectKey.ts, which is tested.
 * tsconfig.functions.json only includes functions/, so nothing under src/ is in
 * scope here — the same boundary KINDS and the payload budgets are duplicated
 * across, for the same reason.
 */

const MEDIA_PREFIX = 'media';
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A hard ceiling on one object, well above what the capture ladder in
 * features/exercise/photo.ts produces (180 KiB) but far below anything that
 * could only have come from a bug.
 */
const MAX_BYTES = 2 * 1024 * 1024;

function parseKey(key: string): { coupleId: string; ext: string } | null {
  const parts = key.split('/');
  if (parts.length !== 4 || parts[0] !== MEDIA_PREFIX) return null;
  const [, coupleId, memberId, file] = parts;
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return null;
  const hash = file.slice(0, dot);
  const ext = file.slice(dot + 1);
  if (!SEGMENT_PATTERN.test(coupleId) || !SEGMENT_PATTERN.test(memberId)) return null;
  if (!HASH_PATTERN.test(hash)) return null;
  if (!Object.values(EXTENSIONS).includes(ext)) return null;
  return { coupleId, ext };
}

function contentTypeFor(ext: string): string {
  return Object.entries(EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store one photograph. The client sends raw bytes; the key comes back. */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);
  if (!env.MEDIA) return json({ error: 'photo storage is not configured here' }, 503);

  const ext = EXTENSIONS[(request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()];
  if (!ext) return json({ error: 'photos must be webp, jpeg or png' }, 415);

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'nothing was sent' }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'that photo is too large' }, 413);

  // Recomputed, never taken from the client: naming an object freely is naming
  // someone else's object.
  const hash = await sha256Hex(bytes);
  const key = `${MEDIA_PREFIX}/${caller.coupleId}/${caller.memberId}/${hash}.${ext}`;

  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: contentTypeFor(ext) },
  });

  return json({ key, hash, bytes: bytes.byteLength });
};

/** Read one back. Both phones may read the couple's photographs; nobody else may. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);
  if (!env.MEDIA) return json({ error: 'photo storage is not configured here' }, 503);

  const key = new URL(request.url).searchParams.get('key') ?? '';
  const parsed = parseKey(key);
  // An unparseable key and another couple's key get the same answer, so this
  // cannot be used to find out which keys exist.
  if (!parsed || parsed.coupleId !== caller.coupleId) return json({ error: 'not found' }, 404);

  const object = await env.MEDIA.get(key);
  if (!object) return json({ error: 'not found' }, 404);

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? contentTypeFor(parsed.ext),
      'content-length': String(object.size),
      // The key is the hash of the bytes, so the bytes can never change under
      // it. Private, because this is a photograph of someone.
      'cache-control': 'private, max-age=31536000, immutable',
      etag: object.httpEtag,
    },
  });
};

/** Remove one. Only within the caller's own couple. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);
  if (!env.MEDIA) return json({ error: 'photo storage is not configured here' }, 503);

  const key = new URL(request.url).searchParams.get('key') ?? '';
  const parsed = parseKey(key);
  if (!parsed || parsed.coupleId !== caller.coupleId) return json({ error: 'not found' }, 404);

  await env.MEDIA.delete(key);
  return json({ ok: true });
};
