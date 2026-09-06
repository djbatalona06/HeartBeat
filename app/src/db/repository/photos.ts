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
 * is held to 64 KiB and a photograph is not. `pwa/sync.ts` now carries these
 * rows as their own entry kind, `photo`, which has its own 512 KiB ceiling —
 * so a day of proof travels without a mood or a cycle row riding on its size.
 * A day travels whole, both cameras in one payload, because the server's unique
 * index is (member, kind, day).
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
