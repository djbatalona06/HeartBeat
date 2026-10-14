import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { feedPet, loadCare, performRitual } from './index';
import { feedActId, foodKey, ritualActId, type FoodItem } from '../../domain/rpg/care';

/**
 * The invariants that must not go wrong: an act becoming two rows, a meal being
 * eaten twice, and a partner being unable to feed what you earned.
 */

const COUPLE = 'couple-1';
const ME = 'member-a';
const THEM = 'member-b';
const TODAY = '2026-10-14';
const YESTERDAY = '2026-10-13';

const MEAL: FoodItem = {
  key: foodKey('meal', ME, TODAY), kind: 'meal', earnerId: ME, earnedDay: TODAY,
};

beforeEach(async () => {
  await Promise.all([
    db.careActs.clear(), db.moods.clear(), db.exercises.clear(),
  ]);
});

describe('feedPet', () => {
  it('writes one row, under the derived id, as the feeder', async () => {
    expect(await feedPet(COUPLE, ME, MEAL, TODAY)).toEqual({ ok: true });
    const rows = await db.careActs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: feedActId(MEAL, ME), memberId: ME, earnerId: ME, kind: 'meal', day: TODAY,
    });
  });

  it('lets your partner feed the meal you earned, as themselves', async () => {
    expect((await feedPet(COUPLE, THEM, MEAL, TODAY)).ok).toBe(true);
    const [row] = await db.careActs.toArray();
    expect(row.memberId).toBe(THEM);
    expect(row.earnerId).toBe(ME);
  });

  /** The invariant this file exists for. */
  it('writes nothing on a second tap, and does not move the stamp', async () => {
    await feedPet(COUPLE, ME, MEAL, TODAY);
    const first = (await db.careActs.toArray())[0];
    await feedPet(COUPLE, ME, MEAL, TODAY);
    const rows = await db.careActs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].updatedAt).toBe(first.updatedAt);
  });

  it('refuses an item the other phone already ate, so a meal is never eaten twice', async () => {
    await feedPet(COUPLE, THEM, MEAL, TODAY);
    const second = await feedPet(COUPLE, ME, MEAL, TODAY);
    expect(second.ok).toBe(false);
    expect(await db.careActs.count()).toBe(1);
  });

  it('still refuses it across a day boundary, while the item is in the pantry', async () => {
    await feedPet(COUPLE, THEM, MEAL, YESTERDAY);
    expect((await feedPet(COUPLE, ME, MEAL, TODAY)).ok).toBe(false);
  });
});

describe('performRitual', () => {
  it('is once per person per ritual per day', async () => {
    await performRitual(COUPLE, ME, 'pet', TODAY);
    await performRitual(COUPLE, ME, 'pet', TODAY);
    expect(await db.careActs.count()).toBe(1);
    expect((await db.careActs.get(ritualActId('pet', TODAY, ME)))?.kind).toBe('pet');
  });

  it('lets each of you do the same ritual, and a different one, and the next day', async () => {
    await performRitual(COUPLE, ME, 'pet', TODAY);
    await performRitual(COUPLE, THEM, 'pet', TODAY);
    await performRitual(COUPLE, ME, 'play', TODAY);
    await performRitual(COUPLE, ME, 'pet', YESTERDAY);
    expect(await db.careActs.count()).toBe(4);
  });
});

describe('loadCare', () => {
  it('earns food from either partner\'s logs and shows it as the couple\'s pantry', async () => {
    await db.moods.put({
      id: 'm1', memberId: ME, day: TODAY, ateWell: true,
    } as never);
    await db.exercises.put({ id: 'x1', memberId: THEM, day: TODAY } as never);

    const care = await loadCare(TODAY);
    expect(care.pantry.map((i) => `${i.kind}:${i.earnerId}`).sort())
      .toEqual(['meal:member-a', 'snack:member-b']);
  });

  it('takes an item out of the pantry once either of you has fed it', async () => {
    await db.moods.put({ id: 'm1', memberId: ME, day: TODAY, ateWell: true } as never);
    await feedPet(COUPLE, THEM, MEAL, TODAY);

    const care = await loadCare(TODAY);
    expect(care.items).toHaveLength(1);
    expect(care.pantry).toEqual([]);
    expect(care.acts).toHaveLength(1);
  });
});
