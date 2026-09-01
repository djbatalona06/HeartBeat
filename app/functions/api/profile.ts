import { authenticate, json, type Env } from './_lib';

/**
 * Who the two of you are: a name and a face each.
 *
 * The rest of this app is one person's account of their own day, synced as
 * opaque payloads. A profile is not that — it is the one row each half of the
 * couple keeps *for* the other, and the only reason it goes through the server
 * at all is so her phone can show his name.
 *
 * So it is deliberately small. GET serves both members of the caller's couple;
 * PUT writes the caller's own row and nobody else's — there is no member id in
 * the request, because the bearer already says which row this is.
 *
 * `tracks_cycle` is not served. The column exists from 0001 and nothing has
 * ever written it: cycle ownership is answered on the device, in settings, and
 * serving a column no writer maintains would only be serving a zero that looks
 * like an answer.
 */

/** Longer than anyone's name, short enough that it cannot be used as a note. */
const MAX_DISPLAY_NAME = 40;

/**
 * The ceiling on a stored photo, measured on the data URI itself — the string
 * is what the row costs here and in every phone that pulls it. The client
 * crops to 256px and walks a quality ladder down to fit; this is the backstop
 * for a client that does not. Matches PHOTO_BUDGET_BYTES in
 * src/features/settings/photo.ts, which cannot be imported across the
 * browser/Workers type boundary.
 */
const MAX_PHOTO_BYTES = 64 * 1024;

/** Only what a canvas encodes. No SVG: that one is a document, not a picture. */
const PHOTO_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

interface Row {
  id: string;
  couple_id: string;
  display_name: string;
  photo_data_uri: string | null;
  updated_at: number;
}

const SELECT_MEMBERS =
  `SELECT id, couple_id, display_name, photo_data_uri, updated_at FROM members
    WHERE couple_id = ? ORDER BY created_at ASC`;

function toMember(row: Row, callerId: string) {
  return {
    id: row.id,
    coupleId: row.couple_id,
    displayName: row.display_name ?? '',
    photoDataUri: row.photo_data_uri ?? undefined,
    updatedAt: row.updated_at,
    // Whose card this is, resolved server-side for the same reason the message
    // thread does it: the client should not have to compare ids it may not
    // have loaded yet.
    mine: row.id === callerId,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(SELECT_MEMBERS).bind(caller.coupleId).all<Row>();
  return json({ members: (rows.results ?? []).map((row) => toMember(row, caller.memberId)) });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const parsed = (await request.json().catch(() => ({}))) as {
    displayName?: unknown;
    photoDataUri?: unknown;
  };

  const sets: string[] = [];
  const binds: (string | null)[] = [];

  if (parsed.displayName !== undefined) {
    if (typeof parsed.displayName !== 'string') return json({ error: 'name must be text' }, 400);
    const name = parsed.displayName.trim();
    if (name.length > MAX_DISPLAY_NAME) return json({ error: 'name too long' }, 400);
    sets.push('display_name = ?');
    binds.push(name);
  }

  // null is "take it off", which is a different request from leaving the field
  // out — an update to the name alone must not delete the photo.
  if (parsed.photoDataUri !== undefined) {
    if (parsed.photoDataUri === null) {
      sets.push('photo_data_uri = ?');
      binds.push(null);
    } else if (typeof parsed.photoDataUri !== 'string') {
      return json({ error: 'photo must be a data URI' }, 400);
    } else if (!PHOTO_PATTERN.test(parsed.photoDataUri)) {
      return json({ error: 'photo must be a png, jpeg or webp data URI' }, 400);
    } else if (parsed.photoDataUri.length > MAX_PHOTO_BYTES) {
      return json({ error: 'photo too large' }, 413);
    } else {
      sets.push('photo_data_uri = ?');
      binds.push(parsed.photoDataUri);
    }
  }

  if (!sets.length) return json({ error: 'nothing to update' }, 400);

  const updatedAt = Date.now();
  await env.DB.prepare(`UPDATE members SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...binds, updatedAt, caller.memberId)
    .run();

  // Read back rather than echo: what the couple's other phone will pull is the
  // row, not the request.
  const rows = await env.DB.prepare(SELECT_MEMBERS).bind(caller.coupleId).all<Row>();
  return json({ members: (rows.results ?? []).map((row) => toMember(row, caller.memberId)) });
};
