import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { claimAchievements, listAchievements, putMood, putWorkoutPhoto } from './repository';
import { TIER_PAYOUT, achievementByCode } from '../domain/achievements/catalogue';

/**
 * The one writer the shelf has.
 *
 * What can go wrong here is not "an achievement did not appear" — it is the
 * same rung being paid twice, which is what a live query firing mid-write
 * would cause if the stored codes were read outside the transaction.
 */

const COUPLE = 'couple-1';
const ME = 'member-a';
const THEM = 'member-b';

beforeEach(async () => {
  await Promise.all([
    db.achievements.clear(), db.moods.clear(), db.exercises.clear(), db.cycles.clear(),
    db.work.clear(), db.workoutPhotos.clear(), db.messages.clear(), db.lifeEvents.clear(),
    db.tasks.clear(), db.avatars.clear(), db.pets.clear(), db.pet.clear(),
  ]);
});

describe('claimAchievements', () => {
  it('writes nothing for a couple who have just paired', async () => {
    const result = await claimAchievements(COUPLE);
    expect(result.unlocked).toEqual([]);
    expect(result.xp).toBe(0);
    expect(await db.achievements.count()).toBe(0);
    // Not even an empty pet row: nothing happened, so nothing was written.
    expect(await db.pet.get(COUPLE)).toBeUndefined();
  });

  it('gives the first rung the moment there is something to give it for', async () => {
    await putMood(ME, '2026-03-01', { hunger: 5, joy: 7, moody: 3 });

    const result = await claimAchievements(COUPLE);
    expect(result.unlocked.map((d) => d.code)).toContain('mood.1');
    expect(result.xp).toBe(TIER_PAYOUT[1]);

    const stored = await listAchievements(COUPLE);
    expect(stored.map((r) => r.code)).toEqual(['mood.1']);
    expect(stored[0].xp).toBe(TIER_PAYOUT[1]);
  });

  it('lands the XP on the shared pet', async () => {
    await putMood(ME, '2026-03-01', { hunger: 5, joy: 7, moody: 3 });
    await claimAchievements(COUPLE);
    expect((await db.pet.get(COUPLE))?.xp).toBe(TIER_PAYOUT[1]);
  });

  /** The whole point of reading the stored codes inside the transaction. */
  it('pays once, however many times it is called', async () => {
    await putMood(ME, '2026-03-01', { hunger: 5, joy: 7, moody: 3 });

    const first = await claimAchievements(COUPLE);
    const second = await claimAchievements(COUPLE);
    const third = await claimAchievements(COUPLE);

    expect(first.xp).toBe(TIER_PAYOUT[1]);
    expect(second).toEqual({ unlocked: [], xp: 0 });
    expect(third).toEqual({ unlocked: [], xp: 0 });
    expect(await db.achievements.count()).toBe(1);
    expect((await db.pet.get(COUPLE))?.xp).toBe(TIER_PAYOUT[1]);
  });

  it('pays once when two calls overlap', async () => {
    await putMood(ME, '2026-03-01', { hunger: 5, joy: 7, moody: 3 });

    // Concurrent, the way a live query re-firing on its own write would be.
    await Promise.all([claimAchievements(COUPLE), claimAchievements(COUPLE)]);

    const stored = await listAchievements(COUPLE);
    expect(stored).toHaveLength(1);
    expect((await db.pet.get(COUPLE))?.xp).toBe(TIER_PAYOUT[1]);
  });

  it('gives every rung passed at once when several arrive together', async () => {
    const second = achievementByCode('mood.2')!;
    for (let i = 0; i < second.need; i += 1) {
      await putMood(ME, `2026-03-${String(i + 1).padStart(2, '0')}`, { hunger: 5, joy: 5, moody: 3 });
    }

    const result = await claimAchievements(COUPLE);
    const codes = result.unlocked.map((d) => d.code);
    expect(codes).toContain('mood.1');
    expect(codes).toContain('mood.2');
    expect(result.xp).toBe(TIER_PAYOUT[1] + TIER_PAYOUT[2]);
  });

  it('counts both people, because the shelf belongs to the couple', async () => {
    await putMood(ME, '2026-03-01', { hunger: 5, joy: 7, moody: 3 });
    await claimAchievements(COUPLE);

    const before = (await db.pet.get(COUPLE))!.xp;
    // Their days count towards the same rungs as mine.
    const second = achievementByCode('mood.2')!;
    for (let i = 1; i < second.need; i += 1) {
      await putMood(THEM, `2026-04-${String(i).padStart(2, '0')}`, { hunger: 5, joy: 5, moody: 3 });
    }

    const result = await claimAchievements(COUPLE);
    expect(result.unlocked.map((d) => d.code)).toEqual(['mood.2']);
    expect((await db.pet.get(COUPLE))!.xp).toBe(before + TIER_PAYOUT[2]);
  });

  it('counts a day of proof once, not once per camera', async () => {
    await putWorkoutPhoto(ME, '2026-03-01', {
      facing: 'front', dataUri: 'data:image/jpeg;base64,AAAA', bytes: 4,
    });
    await putWorkoutPhoto(ME, '2026-03-01', {
      facing: 'back', dataUri: 'data:image/jpeg;base64,BBBB', bytes: 4,
    });

    const result = await claimAchievements(COUPLE);
    // proof.1 needs one day; two cameras on one day must not reach proof.2.
    const codes = result.unlocked.map((d) => d.code);
    expect(codes).toContain('proof.1');
    expect(codes).not.toContain('proof.2');
  });

  it('never takes a rung back once it has been given', async () => {
    await putMood(ME, '2026-03-01', { hunger: 5, joy: 7, moody: 3 });
    await claimAchievements(COUPLE);

    // The day is deleted; the achievement stays, and nothing is re-paid.
    await db.moods.clear();
    const after = await claimAchievements(COUPLE);

    expect(after).toEqual({ unlocked: [], xp: 0 });
    expect((await listAchievements(COUPLE)).map((r) => r.code)).toEqual(['mood.1']);
    expect((await db.pet.get(COUPLE))?.xp).toBe(TIER_PAYOUT[1]);
  });

  it('leaves another couple’s shelf alone', async () => {
    await db.achievements.put({
      id: 'other', coupleId: 'couple-2', code: 'mood.1', xp: 5, unlockedAt: 1,
    });
    await putMood(ME, '2026-03-01', { hunger: 5, joy: 7, moody: 3 });

    await claimAchievements(COUPLE);

    expect((await listAchievements(COUPLE)).map((r) => r.code)).toEqual(['mood.1']);
    expect((await listAchievements('couple-2')).map((r) => r.id)).toEqual(['other']);
  });
});

describe('listAchievements', () => {
  it('reads newest first', async () => {
    await db.achievements.bulkPut([
      { id: 'a', coupleId: COUPLE, code: 'mood.1', xp: 20, unlockedAt: 100 },
      { id: 'b', coupleId: COUPLE, code: 'mood.2', xp: 45, unlockedAt: 300 },
      { id: 'c', coupleId: COUPLE, code: 'mood.3', xp: 90, unlockedAt: 200 },
    ]);
    expect((await listAchievements(COUPLE)).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('is empty for a couple with nothing yet', async () => {
    expect(await listAchievements('nobody')).toEqual([]);
  });
});

/**
 * Achievement XP lands on the shared pet, and the pet's level is itself one of
 * the measures. That is a loop: a claim can raise the level, which can reach a
 * pet rung, which pays again. It is bounded — every rung pays once and there
 * are finitely many — but bounded is worth proving rather than assuming.
 */
describe('the pet-level loop', () => {
  it('settles, and pays each rung exactly once', async () => {
    await putMood(ME, '2026-03-01', { hunger: 5, joy: 7, moody: 3 });

    let rounds = 0;
    for (;;) {
      const result = await claimAchievements(COUPLE);
      if (result.unlocked.length === 0) break;
      rounds += 1;
      // A runaway would never stop; anything past a handful is a real problem.
      expect(rounds).toBeLessThan(10);
    }

    const codes = (await listAchievements(COUPLE)).map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);

    // And the pet's XP is exactly the sum of what was actually awarded.
    const awarded = (await listAchievements(COUPLE)).reduce((sum, r) => sum + r.xp, 0);
    expect((await db.pet.get(COUPLE))?.xp).toBe(awarded);
  });
});
