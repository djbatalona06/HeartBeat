import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { photosInRange, workoutDays } from './index';
import type { ExerciseEntry, WorkoutPhoto } from '../../domain/types';

/**
 * The two reads the Move screen's week strip and photo wall are built on.
 *
 * Both answer a question about *the couple's* week rather than one person's
 * rows, which is the part worth pinning: the partner's photographs are already
 * on this device and the only thing that ever stopped them being shown was a
 * query scoped to `memberId`.
 */

const HER = 'member-a';
const HIM = 'member-b';

function entry(day: string, memberId: string, sets: ExerciseEntry['sets']): ExerciseEntry {
  return { id: `${memberId}-${day}`, memberId, day, sets, updatedAt: 1 };
}

function shot(day: string, memberId: string, facing: 'front' | 'back'): WorkoutPhoto {
  return {
    id: `${memberId}-${day}-${facing}`,
    memberId,
    day,
    facing,
    bytes: 1000,
    updatedAt: 1,
  };
}

const SET = [{ name: 'Back squat', reps: 5, weightKg: 100 }];

beforeEach(async () => {
  await Promise.all([db.exercises.clear(), db.workoutPhotos.clear()]);
});

describe('workoutDays', () => {
  it('reports a day that has sets on it', async () => {
    await db.exercises.put(entry('2026-09-16', HER, SET));
    expect(await workoutDays('2026-09-14', '2026-09-20', HER)).toEqual(['2026-09-16']);
  });

  /**
   * An entry can hold nothing but a caption — `isWorthSaving` allows it, and a
   * line about a rest day is worth keeping. It is not a day somebody trained,
   * and marking it as one would make the week strip disagree with anything
   * counting a week.
   */
  it('does not report a caption-only day as trained', async () => {
    await db.exercises.put({ ...entry('2026-09-16', HER, []), caption: 'Rest day.' });
    expect(await workoutDays('2026-09-14', '2026-09-20', HER)).toEqual([]);
  });

  it('stays inside the range, inclusive at both ends', async () => {
    await db.exercises.bulkPut([
      entry('2026-09-13', HER, SET), // the Sunday before
      entry('2026-09-14', HER, SET), // the Monday
      entry('2026-09-20', HER, SET), // the Sunday
      entry('2026-09-21', HER, SET), // the Monday after
    ]);
    expect(await workoutDays('2026-09-14', '2026-09-20', HER))
      .toEqual(['2026-09-14', '2026-09-20']);
  });

  it('answers for one member when asked for one', async () => {
    await db.exercises.bulkPut([
      entry('2026-09-16', HER, SET),
      entry('2026-09-17', HIM, SET),
    ]);
    expect(await workoutDays('2026-09-14', '2026-09-20', HER)).toEqual(['2026-09-16']);
    expect(await workoutDays('2026-09-14', '2026-09-20', HIM)).toEqual(['2026-09-17']);
  });

  it('folds both members into one set of days when asked for neither', async () => {
    await db.exercises.bulkPut([
      entry('2026-09-16', HER, SET),
      entry('2026-09-16', HIM, SET), // the same day, both of them
      entry('2026-09-18', HIM, SET),
    ]);
    // Deduplicated: the caller asked which days were trained, not how many
    // rows exist.
    expect(await workoutDays('2026-09-14', '2026-09-20')).toEqual(['2026-09-16', '2026-09-18']);
  });
});

describe('photosInRange', () => {
  it('returns both members, not just this device', async () => {
    await db.workoutPhotos.bulkPut([
      shot('2026-09-16', HER, 'back'),
      shot('2026-09-16', HIM, 'back'),
    ]);
    const found = await photosInRange('2026-09-14', '2026-09-20');
    expect(found.map((p) => p.memberId)).toEqual([HER, HIM]);
  });

  it('is newest day first', async () => {
    await db.workoutPhotos.bulkPut([
      shot('2026-09-15', HER, 'back'),
      shot('2026-09-18', HER, 'back'),
      shot('2026-09-16', HER, 'back'),
    ]);
    expect((await photosInRange('2026-09-14', '2026-09-20')).map((p) => p.day))
      .toEqual(['2026-09-18', '2026-09-16', '2026-09-15']);
  });

  /**
   * A pulled row's id is synthesised as `<entryId>-<index>` and the whole day
   * is deleted and re-put on every winning sync, so the order must not come
   * from Dexie's traversal or from the id — the wall would reshuffle whenever
   * the other phone saved anything.
   */
  it('orders a single day by member and then camera, stably', async () => {
    await db.workoutPhotos.bulkPut([
      shot('2026-09-16', HIM, 'front'),
      shot('2026-09-16', HER, 'front'),
      shot('2026-09-16', HIM, 'back'),
      shot('2026-09-16', HER, 'back'),
    ]);
    const found = await photosInRange('2026-09-14', '2026-09-20');
    expect(found.map((p) => `${p.memberId}:${p.facing}`)).toEqual([
      `${HER}:back`, `${HER}:front`, `${HIM}:back`, `${HIM}:front`,
    ]);
  });

  it('stays inside the range, inclusive at both ends', async () => {
    await db.workoutPhotos.bulkPut([
      shot('2026-09-13', HER, 'back'),
      shot('2026-09-14', HER, 'back'),
      shot('2026-09-20', HER, 'back'),
      shot('2026-09-21', HER, 'back'),
    ]);
    expect((await photosInRange('2026-09-14', '2026-09-20')).map((p) => p.day))
      .toEqual(['2026-09-20', '2026-09-14']);
  });

  it('is empty rather than throwing for a week with nothing in it', async () => {
    expect(await photosInRange('2026-09-14', '2026-09-20')).toEqual([]);
  });
});
