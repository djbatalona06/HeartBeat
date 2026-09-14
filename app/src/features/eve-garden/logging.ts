import type { DayKey, MemberId } from '../../domain/types';
import { putExercise, putMood, putWorkEvent } from '../../db/repository';
import { db } from '../../db/database';
import { NEUTRAL_MOOD } from '../mood/mood';
import type { Activity } from './engine/types';

/**
 * Turning an action-bar tap into the row the rest of the app already reads.
 *
 * Nothing here is a new write path. Each branch calls the same repository
 * function the corresponding page calls, so a workout logged from the garden is
 * the same row, in the same table, with the same shape as one logged from
 * `/exercise` — it shows up on that page, it feeds `coupleVitals`, and it syncs
 * through `/api/entries` without knowing where it came from.
 *
 * That is the whole reason this file is twenty lines rather than a repository
 * section of its own. Eve's Garden is a second *surface* on the couple's log,
 * not a second log.
 *
 * ## What a one-tap log means
 *
 * The action bar cannot ask for detail — it is a button in the middle of a
 * fight — so each of these writes the smallest honest row and leaves the real
 * page to refine it. A mood logged here is the neutral reading, which is what
 * the mood page itself starts from; a workout is an unnamed session. Both
 * upsert on `[memberId+day]`, so opening the proper page afterwards edits the
 * same row rather than stacking a second one.
 */

export async function logActivity(
  activity: Activity,
  memberId: MemberId,
  day: DayKey,
): Promise<void> {
  switch (activity) {
    case 'Mood': {
      // Only if the day is still blank. Overwriting a mood somebody actually
      // sat down and set, with a neutral default, because they tapped a combat
      // button, would be the worst thing in this file.
      const existing = await db.moods.where('[memberId+day]').equals([memberId, day]).first();
      if (existing) return;
      await putMood(memberId, day, { ...NEUTRAL_MOOD });
      return;
    }

    case 'Exercise': {
      const existing = await db.exercises.where('[memberId+day]').equals([memberId, day]).first();
      if (existing) return;
      await putExercise(memberId, day, { sets: [], caption: 'Logged from the garden.' });
      return;
    }

    case 'Work': {
      // All-day rather than timed: the bar cannot ask when, and `startsAt`
      // being absent is exactly how this schema spells "all day".
      await putWorkEvent(memberId, day, { title: 'Focused work', source: 'manual' });
      return;
    }

    // Rest and Gratitude have no table of their own. They are real combat
    // actions and real XP, and they deliberately write nothing: inventing a
    // `rest` table so a heal button has somewhere to land would be a schema
    // change in service of a UI affordance. The XP is the record.
    case 'Rest':
    case 'Gratitude':
      return;
  }
}
