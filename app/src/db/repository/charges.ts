import { db } from '../database';
import type { DayKey } from '../../domain/types';
import { chargesFor, type TodayRow } from '../../domain/rpg/charges';
import type { Charge } from '../../features/eve-garden/engine/types';

/* -- today's charges ---------------------------------------------------------

   What the two of you have logged today, as Eve's Garden reads it. Every row
   here is one the rest of the app already writes — this adds no table and no
   write path, which is the whole reason a log from the exercise page lights
   the same charge as one from the garden's strip.

   Only hand-logged work counts as study: a calendar import is a thousand rows
   somebody did not sit down and log today. */

export async function todaysCharges(coupleId: string | undefined, day: DayKey): Promise<Charge[]> {
  const [moods, exercises, work, pet] = await Promise.all([
    db.moods.where('day').equals(day).toArray(),
    db.exercises.where('day').equals(day).toArray(),
    db.work.where('day').equals(day).filter((event) => event.source === 'manual').toArray(),
    coupleId ? db.pet.get(coupleId) : undefined,
  ]);

  const rows: TodayRow[] = [
    ...moods.map((row) => ({ memberId: row.memberId, activity: 'Mood' as const })),
    ...exercises.map((row) => ({ memberId: row.memberId, activity: 'Exercise' as const })),
    ...work.map((row) => ({ memberId: row.memberId, activity: 'Work' as const })),
  ];

  return chargesFor({ day, rows, awardIds: pet?.awardedXpIds ?? [] });
}
