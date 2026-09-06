#!/usr/bin/env node
/**
 * Move photographs that are already in D1 out to R2, once.
 *
 * Workout proof lives in `entries.payload` as base64 and faces live in
 * `members.photo_data_uri`. New writes go to R2 (app/functions/api/media.ts),
 * but everything logged before that is still in the database, and the row-size
 * problem is about what has accumulated — so it has to be carried over rather
 * than left behind.
 *
 * Run it against the deployed database with the same credentials the deploy
 * uses. It is a dry run unless told otherwise:
 *
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     node worker/scripts/backfill-media.mjs            # report only
 *   ... node worker/scripts/backfill-media.mjs --commit # actually write
 *
 * The token needs **D1: Edit** and **R2: Edit**.
 *
 * Safe to run more than once. Keys are the SHA-256 of the bytes, so re-uploading
 * writes the same object to the same name, and a row already carrying a key is
 * skipped. Nothing is deleted: `photo_data_uri` and the base64 inside old
 * payloads stay until a later migration drops them, so a phone that has not
 * updated yet keeps working and a bad run can simply be run again.
 */

import { createHash } from 'node:crypto';

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DATABASE = process.env.HEARTBEAT_D1_ID ?? 'dcfde6ff-f415-427a-bfc4-c08bd6911699';
const BUCKET = process.env.HEARTBEAT_R2_BUCKET ?? 'heartbeat';
const COMMIT = process.argv.includes('--commit');

if (!ACCOUNT || !TOKEN) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.');
  process.exit(1);
}

const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const auth = { Authorization: `Bearer ${TOKEN}` };

async function d1(sql, params = []) {
  const res = await fetch(`${API}/d1/database/${DATABASE}/query`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(`D1: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.result?.[0]?.results ?? [];
}

/** data:image/jpeg;base64,... -> { bytes, ext }. Null for anything unreadable. */
function decode(dataUri) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUri ?? '');
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  return { bytes: Buffer.from(match[2], 'base64'), ext };
}

const CONTENT_TYPE = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

async function putObject(key, bytes, ext) {
  if (!COMMIT) return;
  const res = await fetch(`${API}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': CONTENT_TYPE[ext] },
    body: bytes,
  });
  if (!res.ok) throw new Error(`R2 put ${key}: ${res.status} ${await res.text()}`);
}

function keyFor(coupleId, memberId, bytes, ext) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  return { key: `media/${coupleId}/${memberId}/${hash}.${ext}`, hash };
}

const tally = { faces: 0, shots: 0, skipped: 0, unreadable: 0, bytes: 0 };

/* ---- faces ---------------------------------------------------------------- */

for (const row of await d1(
  `SELECT id, couple_id, photo_data_uri FROM members
    WHERE photo_data_uri IS NOT NULL AND photo_key IS NULL`,
)) {
  const decoded = decode(row.photo_data_uri);
  if (!decoded) { tally.unreadable += 1; continue; }
  const { key } = keyFor(row.couple_id, row.id, decoded.bytes, decoded.ext);
  await putObject(key, decoded.bytes, decoded.ext);
  // photo_data_uri is left in place on purpose: a phone that has not updated
  // still reads it, and a later migration drops the column once none do.
  if (COMMIT) await d1('UPDATE members SET photo_key = ? WHERE id = ?', [key, row.id]);
  tally.faces += 1;
  tally.bytes += decoded.bytes.length;
}

/* ---- workout proof -------------------------------------------------------- */

for (const row of await d1(
  `SELECT id, couple_id, member_id, payload FROM entries WHERE kind = 'photo'`,
)) {
  let shots;
  try {
    shots = JSON.parse(row.payload);
  } catch {
    tally.unreadable += 1;
    continue;
  }
  if (!Array.isArray(shots)) { tally.unreadable += 1; continue; }

  let changed = false;
  /** Objects to write for this row, held until the payload is known to be sound. */
  const pending = [];
  const rewritten = shots.map((shot) => {
    if (shot?.key) { tally.skipped += 1; return shot; }
    const decoded = decode(shot?.dataUri);
    if (!decoded) { tally.unreadable += 1; return shot; }
    const { key, hash } = keyFor(row.couple_id, row.member_id, decoded.bytes, decoded.ext);
    changed = true;
    tally.shots += 1;
    tally.bytes += decoded.bytes.length;
    pending.push([key, decoded.bytes, decoded.ext]);
    // dataUri is dropped from the payload here — unlike a face, this row is the
    // thing that was getting large, and it is what the size problem is about.
    return { facing: shot.facing, key, hash, bytes: decoded.bytes.length, updatedAt: shot.updatedAt };
  });

  if (!changed) continue;
  for (const [key, bytes, ext] of pending.splice(0)) await putObject(key, bytes, ext);
  if (COMMIT) {
    await d1('UPDATE entries SET payload = ? WHERE id = ?', [JSON.stringify(rewritten), row.id]);
  }
}

console.log(
  COMMIT ? 'Backfill complete.' : 'Dry run — nothing was written. Pass --commit to apply.',
);
console.table(tally);
console.log(`${(tally.bytes / 1024 / 1024).toFixed(1)} MiB of photographs would move out of D1.`);
