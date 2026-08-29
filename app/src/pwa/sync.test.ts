import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database';
import { putCycle, putWorkEvent } from '../db/repository';
import {
  applyPulled,
  collectPending,
  groupWork,
  wins,
  workDayUpdatedAt,
  type PulledEntry,
} from './sync';
import type { CycleEntry, WorkEvent } from '../domain/types';

/**
 * The reconcile rules, which are the part of sync that can be wrong quietly.
 * A push that re-sends what it just pulled loops forever; an apply that keeps
 * the older row silently discards the edit someone actually made.
 */

const ME = 'member-a';
const THEM = 'member-b';

beforeEach(async () => {
  await Promise.all([db.moods.clear(), db.exercises.clear(), db.cycles.clear(), db.work.clear()]);
});

describe('wins', () => {
  it('takes a strictly newer row', () => {
    expect(wins({ updatedAt: 2 }, { updatedAt: 1 })).toBe(true);
  });

  it('keeps what is here when the incoming row is older', () => {
    expect(wins({ updatedAt: 1 }, { updatedAt: 2 })).toBe(false);
  });

  it('treats a re-delivered row as nothing to do', () => {
    // Equal, not newer. Rewriting it would churn the watermark and re-push it.
    expect(wins({ updatedAt: 2 }, { updatedAt: 2 })).toBe(false);
  });

  it('accepts anything when there is nothing here yet', () => {
    expect(wins({ updatedAt: 1 }, undefined)).toBe(true);
  });
});

describe('groupWork', () => {
  const event = (day: string, title: string, updatedAt: number): WorkEvent => ({
    id: `${day}-${title}`, memberId: ME, day, title, source: 'manual', updatedAt,
  });

  it('gathers a day into one row', () => {
    const grouped = groupWork([event('2026-03-01', 'a', 1), event('2026-03-01', 'b', 2)]);
    expect(grouped.get('2026-03-01')).toHaveLength(2);
  });

  it('dates the day by its most recently touched event', () => {
    expect(workDayUpdatedAt([event('2026-03-01', 'a', 5), event('2026-03-01', 'b', 9)])).toBe(9);
  });
});

describe('collectPending', () => {
  it('sends only what changed after the watermark', async () => {
    await putCycle(ME, '2026-03-01', { flow: 'medium' });
    const [row] = await db.cycles.toArray();

    expect(await collectPending(ME, row.updatedAt - 1)).toHaveLength(1);
    expect(await collectPending(ME, row.updatedAt)).toHaveLength(0);
  });

  it("leaves the other member's rows alone", async () => {
    await putCycle(THEM, '2026-03-01', { flow: 'heavy' });
    expect(await collectPending(ME, 0)).toHaveLength(0);
  });

  it('sends a calendar day as a single row carrying its events', async () => {
    await putWorkEvent(ME, '2026-03-02', { title: 'Dentist', source: 'manual' });
    await putWorkEvent(ME, '2026-03-02', { title: 'Dinner', source: 'manual' });

    const pending = await collectPending(ME, 0);
    const work = pending.filter((e) => e.kind === 'work');
    expect(work).toHaveLength(1);
    expect(work[0].payload).toHaveLength(2);
    // Named for the day, not borrowed from an event that could be deleted.
    expect(work[0].id).toBe(`${ME}-work-2026-03-02`);
  });

  it('orders by age so a truncated push still makes progress', async () => {
    await putCycle(ME, '2026-03-01', { flow: 'light' });
    await putCycle(ME, '2026-03-05', { flow: 'heavy' });
    const pending = await collectPending(ME, 0);
    expect(pending[0].updatedAt).toBeLessThanOrEqual(pending[1].updatedAt);
  });
});

describe('applyPulled', () => {
  const pulled = (over: Partial<PulledEntry> & { payload: unknown }): PulledEntry => ({
    id: 'remote-1', kind: 'cycle', day: '2026-03-01', memberId: THEM, mine: false,
    updatedAt: 100, ...over,
  });

  const cycle = (day: string, over: Partial<CycleEntry> = {}): CycleEntry => ({
    id: 'remote-1', memberId: THEM, day, updatedAt: 100, ...over,
  });

  it("lands the partner's day under their own member id", async () => {
    await applyPulled([pulled({ payload: cycle('2026-03-01', { flow: 'heavy' }) })]);
    const rows = await db.cycles.where('memberId').equals(THEM).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].flow).toBe('heavy');
  });

  it('does not overwrite a newer local edit', async () => {
    await putCycle(THEM, '2026-03-01', { flow: 'light' });
    const [local] = await db.cycles.toArray();

    const applied = await applyPulled([
      pulled({ payload: cycle('2026-03-01', { flow: 'heavy' }), updatedAt: local.updatedAt - 1 }),
    ]);

    expect(applied).toBe(0);
    expect((await db.cycles.toArray())[0].flow).toBe('light');
  });

  it('overwrites an older local row in place rather than duplicating it', async () => {
    await putCycle(THEM, '2026-03-01', { flow: 'light' });
    const [local] = await db.cycles.toArray();

    await applyPulled([
      pulled({ payload: cycle('2026-03-01', { flow: 'heavy' }), updatedAt: local.updatedAt + 1 }),
    ]);

    const rows = await db.cycles.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].flow).toBe('heavy');
    // The composite (member, day) index has one row per day; keeping the local
    // id is what stops a second one appearing beside it.
    expect(rows[0].id).toBe(local.id);
  });

  it('replaces a calendar day wholesale, so a deletion propagates', async () => {
    await putWorkEvent(THEM, '2026-03-02', { title: 'Cancelled', source: 'manual' });
    const [local] = await db.work.toArray();

    const remaining: WorkEvent[] = [
      { id: 'kept', memberId: THEM, day: '2026-03-02', title: 'Kept', source: 'manual', updatedAt: local.updatedAt + 5 },
    ];
    await applyPulled([
      pulled({ kind: 'work', day: '2026-03-02', payload: remaining, updatedAt: local.updatedAt + 5 }),
    ]);

    const rows = await db.work.toArray();
    expect(rows.map((r) => r.title)).toEqual(['Kept']);
  });

  it('leaves a calendar day alone when the incoming copy is older', async () => {
    await putWorkEvent(THEM, '2026-03-02', { title: 'Mine', source: 'manual' });
    const [local] = await db.work.toArray();

    const applied = await applyPulled([
      pulled({ kind: 'work', day: '2026-03-02', payload: [], updatedAt: local.updatedAt - 1 }),
    ]);

    expect(applied).toBe(0);
    expect(await db.work.count()).toBe(1);
  });

  it('does not re-send what it just applied', async () => {
    // The loop this guards against: pull a row, store it, find it "changed"
    // locally, push it straight back, forever.
    const at = Date.now();
    await applyPulled([pulled({ payload: cycle('2026-03-01', { flow: 'medium' }), updatedAt: at })]);
    expect(await collectPending(THEM, at)).toHaveLength(0);
  });
});
