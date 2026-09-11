import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { coupleVitals, dayLogs, putCycle, putExercise, putMood } from './index';
import { AWARDS, TOGETHER_BOND } from '../../domain/rpg/vitals';

/**
 * The read that feeds the pet.
 *
 * Two rules matter here and both fail quietly: it must fold one person's mood
 * and workout on one day into a single row (otherwise the together bonus pays
 * per log rather than per day), and it must not filter by member — the pet is
 * fed by both of you, and reading only "mine" is exactly the bug that made the
 * old pet bar a private number under a shared heading.
 */

const ME = 'member-a';
const THEM = 'member-b';
const TODAY = '2026-09-25';
const YESTERDAY = '2026-09-24';

beforeEach(async () => {
  await Promise.all([db.moods.clear(), db.exercises.clear(), db.cycles.clear()]);
});

describe('dayLogs', () => {
  it('folds one member-day into one row with every kind on it', async () => {
    await putMood(ME, TODAY, { hunger: 4, joy: 8, moody: 2 });
    await putExercise(ME, TODAY, { sets: [{ name: 'walk', reps: 1 }] });

    const logs = await dayLogs(TODAY);
    expect(logs).toHaveLength(1);
    expect(logs[0].kinds.sort()).toEqual(['exercise', 'mood']);
  });

  it('keeps the two of you apart, so a shared day is recognisable as one', async () => {
    await putMood(ME, TODAY, { hunger: 4, joy: 8, moody: 2 });
    await putMood(THEM, TODAY, { hunger: 6, joy: 5, moody: 1 });

    const logs = await dayLogs(TODAY);
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.memberId).sort()).toEqual([ME, THEM]);
  });

  it('leaves out days older than the window', async () => {
    await putMood(ME, '2020-01-01', { hunger: 4, joy: 8, moody: 2 });
    expect(await dayLogs(TODAY)).toEqual([]);
  });

  it('counts a cycle check-in but not an empty draft, which is never stored', async () => {
    await putCycle(ME, TODAY, { checkInComplete: true });
    await putCycle(THEM, YESTERDAY, { checkInComplete: false });

    const logs = await dayLogs(TODAY);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ memberId: ME, kinds: ['cycle'] });
  });
});

describe('coupleVitals', () => {
  it('pays the together bonus for a day you both logged', async () => {
    await putExercise(ME, TODAY, { sets: [{ name: 'walk', reps: 1 }] });
    await putMood(THEM, TODAY, { hunger: 4, joy: 8, moody: 2 });

    const vitals = await coupleVitals(TODAY);
    expect(vitals.togetherDays).toBe(1);
    expect(vitals.attributes.vitality).toBe(AWARDS.exercise.vitality);
    expect(vitals.attributes.serenity).toBe(AWARDS.mood.serenity);
    expect(vitals.attributes.bond)
      .toBe(AWARDS.exercise.bond + AWARDS.mood.bond + TOGETHER_BOND);
    expect(vitals.streak.days).toBe(1);
  });

  it('has an answer on a phone that has logged nothing', async () => {
    const vitals = await coupleVitals(TODAY);
    expect(vitals).toMatchObject({ xp: 0, togetherDays: 0, stage: { id: 'egg' } });
  });
});
