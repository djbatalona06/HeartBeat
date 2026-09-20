import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import {
  dropWager, pastWagers, readWager, settleWagers, startWager, wagerCounts, wagerFor,
} from './index';
import { stakeFor } from '../../domain/wager/engine';
import type { ExerciseEntry } from '../../domain/types';

const COUPLE = 'couple-1';
const HER = 'member-a';
const HIM = 'member-b';
const BOTH = [HER, HIM];
/** 2026-09-14 is a Monday, 2026-09-20 its Sunday. */
const MONDAY = '2026-09-14';
const WEDNESDAY = '2026-09-16';
const SUNDAY = '2026-09-20';
const NEXT_MONDAY = '2026-09-21';

const SET = [{ name: 'Back squat', reps: 5, weightKg: 100 }];

function trained(day: string, memberId: string): ExerciseEntry {
  return { id: `${memberId}-${day}`, memberId, day, sets: SET, updatedAt: 1 };
}

/** n distinct days of the week, for one member. */
async function logDays(memberId: string, count: number) {
  const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
  await db.exercises.bulkPut(days.slice(0, count).map((d) => trained(d, memberId)));
}

beforeEach(async () => {
  await Promise.all([db.wagers.clear(), db.exercises.clear(), db.pet.clear()]);
  await db.pet.put({ coupleId: COUPLE, xp: 0, level: 1, mood: 'content', updatedAt: 1 } as never);
});

describe('startWager', () => {
  it('stores one row for the week, whichever day it is started on', async () => {
    const first = await startWager(COUPLE, WEDNESDAY, 3);
    expect(first?.weekStart).toBe(MONDAY);
    expect(first?.stake).toBe(stakeFor(3));
    expect(await db.wagers.count()).toBe(1);
  });

  /**
   * The property the derived id exists for: both phones compute the same key
   * on a Monday morning, so two starts converge on one row rather than leaving
   * the couple holding two wagers for one week.
   */
  it('converges rather than doubling when both of them start one', async () => {
    await startWager(COUPLE, MONDAY, 3);
    await startWager(COUPLE, SUNDAY, 3);
    expect(await db.wagers.count()).toBe(1);
  });

  it('changes the target of the week already staked, keeping the same row', async () => {
    const before = await startWager(COUPLE, MONDAY, 2);
    const after = await startWager(COUPLE, WEDNESDAY, 5);
    expect(after?.id).toBe(before?.id);
    expect(after?.target).toBe(5);
    expect(after?.stake).toBe(stakeFor(5));
    expect(await db.wagers.count()).toBe(1);
  });

  /** Re-opening a paid week would either pay twice or retroactively un-pay. */
  it('refuses to change a week that has already settled', async () => {
    await startWager(COUPLE, MONDAY, 2);
    await logDays(HER, 2);
    await logDays(HIM, 2);
    await settleWagers(COUPLE, WEDNESDAY, BOTH);

    expect(await startWager(COUPLE, WEDNESDAY, 5)).toBeUndefined();
    expect((await wagerFor(COUPLE, WEDNESDAY))?.target).toBe(2);
  });

  it('keeps separate rows for separate weeks', async () => {
    await startWager(COUPLE, MONDAY, 3);
    await startWager(COUPLE, NEXT_MONDAY, 4);
    expect(await db.wagers.count()).toBe(2);
    expect((await pastWagers(COUPLE)).map((w) => w.weekStart))
      .toEqual(['2026-09-21', '2026-09-14']);
  });
});

describe('wagerCounts', () => {
  it('counts days trained, not sessions', async () => {
    // Two sessions on one Tuesday is one day of the week gone, which is what
    // somebody aiming at "three this week" means.
    await db.exercises.bulkPut([
      { ...trained('2026-09-15', HER), id: 'a' },
      { ...trained('2026-09-15', HER), id: 'b' },
    ]);
    expect(await wagerCounts({ weekStart: MONDAY })).toEqual({ [HER]: 1 });
  });

  it('counts each of them separately', async () => {
    await logDays(HER, 3);
    await logDays(HIM, 1);
    expect(await wagerCounts({ weekStart: MONDAY })).toEqual({ [HER]: 3, [HIM]: 1 });
  });

  it('ignores days outside the week', async () => {
    await db.exercises.bulkPut([
      trained('2026-09-13', HER), // the Sunday before
      trained('2026-09-16', HER),
      trained('2026-09-21', HER), // the Monday after
    ]);
    expect(await wagerCounts({ weekStart: MONDAY })).toEqual({ [HER]: 1 });
  });

  it('does not count a caption-only day', async () => {
    await db.exercises.put({ ...trained('2026-09-16', HER), sets: [], caption: 'Rest.' });
    expect(await wagerCounts({ weekStart: MONDAY })).toEqual({});
  });
});

describe('readWager', () => {
  it('says nothing for a week nobody staked', async () => {
    expect(await readWager(COUPLE, WEDNESDAY, BOTH)).toEqual({ counts: {} });
  });

  it('reports the standing without writing anything', async () => {
    await startWager(COUPLE, MONDAY, 3);
    await logDays(HER, 3);
    await logDays(HIM, 1);

    const read = await readWager(COUPLE, WEDNESDAY, BOTH);
    expect(read.step).toEqual({ verb: 'running', short: 2 });
    // Safe in a render path: nothing settled just by looking.
    expect((await wagerFor(COUPLE, WEDNESDAY))?.settledAt).toBeUndefined();
    expect((await db.pet.get(COUPLE))?.xp).toBe(0);
  });
});

describe('settleWagers', () => {
  it('pays the pet once when they both make it', async () => {
    await startWager(COUPLE, MONDAY, 2);
    await logDays(HER, 2);
    await logDays(HIM, 2);

    const first = await settleWagers(COUPLE, WEDNESDAY, BOTH);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ won: true, awarded: stakeFor(2) });
    expect((await db.pet.get(COUPLE))?.xp).toBe(stakeFor(2));

    // The pay-once guard, which is the whole reason settledAt exists. The
    // second call finds nothing open and reports nothing.
    expect(await settleWagers(COUPLE, WEDNESDAY, BOTH)).toEqual([]);
    expect((await db.pet.get(COUPLE))?.xp).toBe(stakeFor(2));
  });

  it('writes nothing at all while it is still running', async () => {
    await startWager(COUPLE, MONDAY, 3);
    await logDays(HER, 3);

    // Still running reports nothing at all rather than a row saying "no".
    expect(await settleWagers(COUPLE, WEDNESDAY, BOTH)).toEqual([]);
    expect((await wagerFor(COUPLE, WEDNESDAY))?.settledAt).toBeUndefined();
    expect((await db.pet.get(COUPLE))?.xp).toBe(0);
  });

  it('closes a week that ran out, and takes nothing', async () => {
    await startWager(COUPLE, MONDAY, 3);
    await logDays(HER, 1);

    // Called with *today*, which by now is in the following week. This is the
    // case the earlier single-week signature could never reach: a lookup keyed
    // on today finds a different week, so last week's sat unsettled forever.
    const settled = await settleWagers(COUPLE, NEXT_MONDAY, BOTH);
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ missed: true, awarded: 0 });

    const closed = await wagerFor(COUPLE, MONDAY);
    // Closed rather than deleted: the row is the record that the week was
    // staked at all, which is the honest version of a miss.
    expect(closed?.settledAt).toBeDefined();
    expect(closed?.met).toBe(false);
    expect((await db.pet.get(COUPLE))?.xp).toBe(0);
  });

  it('pays a week finished on its final day', async () => {
    await startWager(COUPLE, MONDAY, 2);
    await logDays(HER, 2);
    await logDays(HIM, 2);
    expect((await settleWagers(COUPLE, SUNDAY, BOTH))[0]?.won).toBe(true);
  });

  /**
   * One partner training twice as much as the target does not carry the other.
   * The whole point is that both of them arrive.
   */
  it('does not pay when only one of them made it', async () => {
    await startWager(COUPLE, MONDAY, 2);
    await logDays(HER, 5);

    // Still running -- she cannot carry him -- so nothing is reported and
    // nothing is written.
    expect(await settleWagers(COUPLE, WEDNESDAY, BOTH)).toEqual([]);
    expect((await db.pet.get(COUPLE))?.xp).toBe(0);
  });

  it('does nothing for a couple who never staked anything', async () => {
    expect(await settleWagers(COUPLE, WEDNESDAY, BOTH)).toEqual([]);
  });

  /**
   * A phone that has been off for a month comes back to several finished
   * weeks. Each is closed on its own merits rather than the newest one winning
   * and the rest being stranded unsettled.
   */
  it('settles several stale weeks in one pass, oldest first', async () => {
    await startWager(COUPLE, MONDAY, 2);
    await logDays(HER, 2);
    await logDays(HIM, 2);
    await startWager(COUPLE, NEXT_MONDAY, 3);

    const settled = await settleWagers(COUPLE, '2026-10-05', BOTH);
    expect(settled.map((s) => s.wager.weekStart)).toEqual(['2026-09-14', '2026-09-21']);
    expect(settled[0]).toMatchObject({ won: true });
    expect(settled[1]).toMatchObject({ missed: true });
    expect((await db.pet.get(COUPLE))?.xp).toBe(stakeFor(2));
  });
});

describe('dropWager', () => {
  it('gives up a running week and takes nothing', async () => {
    await startWager(COUPLE, MONDAY, 3);
    await dropWager(COUPLE, WEDNESDAY);
    expect(await wagerFor(COUPLE, WEDNESDAY)).toBeUndefined();
    expect((await db.pet.get(COUPLE))?.xp).toBe(0);
  });

  it('leaves a settled week alone, because it happened', async () => {
    await startWager(COUPLE, MONDAY, 2);
    await logDays(HER, 2);
    await logDays(HIM, 2);
    await settleWagers(COUPLE, WEDNESDAY, BOTH);

    await dropWager(COUPLE, WEDNESDAY);
    expect(await wagerFor(COUPLE, WEDNESDAY)).toBeDefined();
  });
});
