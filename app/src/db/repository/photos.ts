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
