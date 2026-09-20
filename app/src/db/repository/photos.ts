import { db } from '../database';
import type { DayKey, MemberId, WorkoutPhoto } from '../../domain/types';
import { id, now } from './shared';


/* ---- workout photos ------------------------------------------------------- */

/**
 * Camera proof for a day's workout: one row per member, per day, per camera.
 *
 * Upserted on `[memberId+day]` the way mood and exercise are, with `facing`
 * narrowing it further — retaking the back-camera shot replaces the back-camera
 * shot and leaves the front one where it was.
 *
 * The row is deliberately not part of the exercise entry: an exercise payload
 * is held to 64 KiB and a photograph is not. `pwa/sync.ts` carries these rows
 * as their own entry kind, `photo`. A day travels whole, both cameras in one
 * payload, because the server's unique index is (member, kind, day).
 *
 * The bytes themselves now live in R2 rather than in D1 — the row keeps a
 * content-addressed key and a local copy of the bytes for rendering offline.
 * A shot saved before its upload lands is marked `pendingUpload`, which is what
 * the sync loop retries; until then it still travels as base64, because a proof
 * taken with no signal should reach the other phone eventually rather than
 * never. See `domain/media/photoWire.ts`.
 */
export async function putWorkoutPhoto(
  memberId: MemberId,
  day: DayKey,
  values: Omit<WorkoutPhoto, 'id' | 'memberId' | 'day' | 'updatedAt'>,
): Promise<void> {
  const sameDay = await db.workoutPhotos.where('[memberId+day]').equals([memberId, day]).toArray();
  const existing = sameDay.find((row) => row.facing === values.facing);
  await db.workoutPhotos.put({
    id: existing?.id ?? id(),
    memberId,
    day,
    ...values,
    updatedAt: now(),
  });
}

/**
 * Record that a shot's bytes reached R2.
 *
 * Keyed by id rather than re-derived from (member, day, facing): an upload can
 * finish after the shot has been retaken, and stamping the key of the old bytes
 * onto the new row would point the partner's phone at the wrong photograph.
 * `hash` is checked for the same reason — the key is named by the bytes, so a
 * key that does not match what is here is a key for something else.
 */
export async function markPhotoUploaded(
  photoId: string,
  hash: string,
  key: string,
): Promise<boolean> {
  const row = await db.workoutPhotos.get(photoId);
  if (!row || (row.hash && row.hash !== hash)) return false;
  await db.workoutPhotos.update(photoId, { key, hash, pendingUpload: false });
  return true;
}

/**
 * Cache bytes fetched for a key, so a photograph is downloaded once.
 *
 * Guarded on the key still matching: by the time a fetch returns, the row may
 * have been replaced by a sync carrying a different shot for that day.
 */
export async function cachePhotoBytes(
  photoId: string,
  key: string,
  dataUri: string,
): Promise<void> {
  const row = await db.workoutPhotos.get(photoId);
  if (!row || row.key !== key) return;
  await db.workoutPhotos.update(photoId, { dataUri });
}

/** Everything on this phone whose bytes never reached R2. */
/**
 * Every proof in a range of days, from both of you.
 *
 * ## Both members, and why that needs no new plumbing
 *
 * The partner's rows are already here. `pwa/sync.ts` applies a pulled `photo`
 * entry without consulting whose it is — there is no `mine` filter on the
 * entries path at all, deliberately, because the point of the couple is that
 * each can see the other's day — and `functions/api/entries.ts` serves both
 * members' rows to either phone. The bytes follow on demand: `/api/media`
 * authorises on the **couple** segment of the key, so this device's own bearer
 * can fetch a shot the other phone took. `usePhotoBytes` is already written for
 * "whoever took it".
 *
 * So all that was missing was the read, and it is the bare `day` index rather
 * than `[memberId+day]` precisely because it must not be scoped to one person.
 *
 * ## Newest first, and stable
 *
 * Sorted by day descending, then by member and facing, so the order does not
 * depend on Dexie's traversal. That matters more than it looks: a pulled row's
 * primary key is synthesised as `<entryId>-<index>` and the whole day is
 * deleted and re-put on every winning sync, so ids are not stable across
 * syncs. Anything rendering these must key on `(memberId, day, facing)` — an
 * id would remount every cell each time the other phone saved anything.
 */
export async function photosInRange(from: DayKey, to: DayKey): Promise<WorkoutPhoto[]> {
  const rows = await db.workoutPhotos.where('day').between(from, to, true, true).toArray();
  return rows.sort((a, b) => (
    b.day.localeCompare(a.day)
      || a.memberId.localeCompare(b.memberId)
      || a.facing.localeCompare(b.facing)
  ));
}

export async function pendingPhotoUploads(memberId: MemberId): Promise<WorkoutPhoto[]> {
  const mine = await db.workoutPhotos.where('memberId').equals(memberId).toArray();
  return mine.filter((row) => row.pendingUpload && row.dataUri);
}

/**
 * Deleting one camera's shot leaves the other one where it is.
 *
 * The shot that stays has its `updatedAt` bumped, which looks redundant and is
 * not: sync dates a day of proof by the newest shot still in it, so a delete
 * that touched nothing would leave the day's timestamp below the watermark and
 * the removal would never be offered to the server — the partner's phone would
 * go on showing a photograph that no longer exists here.
 */
export async function removeWorkoutPhoto(
  memberId: MemberId,
  day: DayKey,
  facing: WorkoutPhoto['facing'],
): Promise<void> {
  const sameDay = await db.workoutPhotos.where('[memberId+day]').equals([memberId, day]).toArray();
  const doomed = sameDay.find((row) => row.facing === facing);
  if (!doomed) return;
  await db.workoutPhotos.delete(doomed.id);

  const at = now();
  await db.workoutPhotos.bulkPut(
    sameDay.filter((row) => row.id !== doomed.id).map((row) => ({ ...row, updatedAt: at })),
  );
}
