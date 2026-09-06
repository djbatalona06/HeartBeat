/**
 * Where a photograph lives once it is out of the database.
 *
 * Workout proof and profile faces were base64 inside D1 — `entries.payload` for
 * one, `members.photo_data_uri` for the other. D1 is not a blob store: rows
 * have a size ceiling, and a couple accumulating months of gym photographs
 * walks towards it while making every unrelated query slower on the way.
 *
 * The bytes now live in R2 and D1 keeps a key. Two properties matter about how
 * that key is built:
 *
 *  - **It is content-addressed.** The name is the SHA-256 of the bytes, so
 *    retaking a shot that encodes identically costs no second object, and a key
 *    cannot be guessed without already having the bytes it names.
 *  - **It is couple-scoped, and the couple comes first.** `/api/media` compares
 *    that segment against the caller before it reads anything, so one couple
 *    cannot fetch another's photograph even holding a valid token. Putting the
 *    couple anywhere but the front would make that check a parse rather than a
 *    prefix comparison.
 *
 * Pure on purpose: no fetch, no R2, no crypto. Hashing happens at the call site
 * where a real digest is available, and everything here can be tested.
 */

export const MEDIA_PREFIX = 'media';

/** What the app is willing to store, and the extension each one gets. */
export const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface MediaKeyParts {
  coupleId: string;
  memberId: string;
  hash: string;
  ext: string;
}

/** A SHA-256 as 64 lowercase hex characters, and nothing else. */
const HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Ids come from `crypto.randomUUID()`, but a key is a path, so anything that
 * could climb out of the prefix is refused rather than sanitised. Silently
 * rewriting a bad segment would produce a key that does not round-trip.
 */
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function mediaKey({ coupleId, memberId, hash, ext }: MediaKeyParts): string {
  if (!SEGMENT_PATTERN.test(coupleId)) throw new Error('bad coupleId for a media key');
  if (!SEGMENT_PATTERN.test(memberId)) throw new Error('bad memberId for a media key');
  if (!HASH_PATTERN.test(hash)) throw new Error('a media key is named by a sha-256');
  if (!Object.values(MEDIA_EXTENSIONS).includes(ext)) throw new Error(`unsupported type: ${ext}`);
  return `${MEDIA_PREFIX}/${coupleId}/${memberId}/${hash}.${ext}`;
}

/** Null rather than a throw: this parses input that arrived over the wire. */
export function parseMediaKey(key: string): MediaKeyParts | null {
  const parts = key.split('/');
  if (parts.length !== 4 || parts[0] !== MEDIA_PREFIX) return null;
  const [, coupleId, memberId, file] = parts;
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return null;
  const hash = file.slice(0, dot);
  const ext = file.slice(dot + 1);
  if (!SEGMENT_PATTERN.test(coupleId) || !SEGMENT_PATTERN.test(memberId)) return null;
  if (!HASH_PATTERN.test(hash)) return null;
  if (!Object.values(MEDIA_EXTENSIONS).includes(ext)) return null;
  return { coupleId, memberId, hash, ext };
}

/**
 * May this caller read this key?
 *
 * The couple, not the member: both phones are meant to see each other's proof,
 * which is the entire point of the feature. The member segment is for tidiness
 * and for knowing whose it was, never for access.
 */
export function keyBelongsToCouple(key: string, coupleId: string): boolean {
  const parsed = parseMediaKey(key);
  return parsed !== null && parsed.coupleId === coupleId;
}

export function extensionFor(contentType: string): string | null {
  return MEDIA_EXTENSIONS[contentType.split(';')[0].trim().toLowerCase()] ?? null;
}

export function contentTypeFor(ext: string): string {
  const found = Object.entries(MEDIA_EXTENSIONS).find(([, e]) => e === ext);
  return found ? found[0] : 'application/octet-stream';
}
