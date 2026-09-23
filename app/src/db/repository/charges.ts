import { db } from '../database';
import type { DayKey } from '../../domain/types';
import { chargesFor, type TodayRow } from '../../domain/rpg/charges';
import type { Charge } from '../../features/eve-garden/engine/types';

/* -- today's charges ---------------------------------------------------------

   What the two of you have logged today, as Eve's Garden reads it. Every row
   here is one the rest of the app already writes — the garden has no logging
   controls of its own. Rest, Gratitude and Nourish are the three flags on a
   mood check-in, so a partner's "rested" lights the charge on both phones.

   Only hand-logged work counts as study: a calendar import is a thousand rows
   somebody did not sit down and log today. */

export async function todaysCharges(day: DayKey): Promise<Charge[]> {
  const [moods, exercises, work] = await Promise.all([
    db.moods.where('day').equals(day).toArray(),
    db.exercises.where('day').equals(day).toArray(),
    db.work.where('day').equals(day).filter((event) => event.source === 'manual').toArray(),
  ]);

  const rows: TodayRow[] = [
    ...moods.map((row) => ({ memberId: row.memberId, activity: 'Mood' as const })),
    ...moods.filter((row) => row.rested).map((row) => ({ memberId: row.memberId, activity: 'Rest' as const })),
    ...moods.filter((row) => row.grateful).map((row) => ({ memberId: row.memberId, activity: 'Gratitude' as const })),
    ...moods.filter((row) => row.ateWell).map((row) => ({ memberId: row.memberId, activity: 'Nourish' as const })),
    ...exercises.map((row) => ({ memberId: row.memberId, activity: 'Exercise' as const })),
    ...work.map((row) => ({ memberId: row.memberId, activity: 'Work' as const })),
  ];

  return chargesFor({ rows });
}
