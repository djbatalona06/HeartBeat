import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, loadSettings, saveSettings } from '../db/database';
import { putCycle, putWorkEvent } from '../db/repository';
import {
  applyPulled,
  chunkForPush,
  collectPending,
  groupPhotos,
  groupWork,
  isPermanentRefusal,
  partitionSendable,
  photoDayUpdatedAt,
  sync,
  wins,
  workDayUpdatedAt,
  type EntryKind,
  type PulledEntry,
  type WireEntry,
} from './sync';
import type { CycleEntry, WorkEvent, WorkoutPhoto } from '../domain/types';

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

/**
 * Photographs, and what happens when one of them is refused.
 *
 * The failure this guards against is not a photograph that fails to sync — it
 * is a photograph that fails to sync and takes mood, cycle and the calendar
 * with it, quietly, because the push throws before the watermark moves and
 * `useSync.ts` swallows the error.
 */
describe('photos on the wire', () => {
  const uri = (kb: number) => `data:image/jpeg;base64,${'A'.repeat(kb * 1024)}`;

  const shot = (over: Partial<WorkoutPhoto> = {}): WorkoutPhoto => ({
    id: 'p1',
    memberId: ME,
    day: '2026-03-01',
    facing: 'front',
    dataUri: uri(1),
    bytes: 1024,
    updatedAt: 10,
    ...over,
  });

  beforeEach(async () => {
    await db.workoutPhotos.clear();
  });

  it('groups a day into one row, because the server index is (member, kind, day)', () => {
    const grouped = groupPhotos([
      shot({ id: 'a', facing: 'front' }),
      shot({ id: 'b', facing: 'back' }),
      shot({ id: 'c', day: '2026-03-02' }),
    ]);
    expect(grouped.get('2026-03-01')?.map((s) => s.id)).toEqual(['a', 'b']);
    expect(grouped.get('2026-03-02')?.map((s) => s.id)).toEqual(['c']);
  });

  it('dates a day by its most recently retaken shot', () => {
    expect(photoDayUpdatedAt([shot({ updatedAt: 5 }), shot({ updatedAt: 9 })])).toBe(9);
  });

  it('collects both cameras as a single photo entry', async () => {
    await db.workoutPhotos.bulkPut([
      shot({ id: 'a', facing: 'front', updatedAt: 10 }),
      shot({ id: 'b', facing: 'back', updatedAt: 12 }),
    ]);
    const pending = await collectPending(ME, 0);
    const photos = pending.filter((e) => e.kind === 'photo');
    expect(photos).toHaveLength(1);
    expect(photos[0].updatedAt).toBe(12);
    expect((photos[0].payload as WorkoutPhoto[]).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('lands a partner day whole, so a deleted proof stays deleted', async () => {
    await db.workoutPhotos.bulkPut([
      shot({ id: 'old-front', memberId: THEM, facing: 'front', updatedAt: 10 }),
      shot({ id: 'old-back', memberId: THEM, facing: 'back', updatedAt: 10 }),
    ]);
    const entry: PulledEntry = {
      id: `${THEM}-photo-2026-03-01`,
      kind: 'photo',
      day: '2026-03-01',
      memberId: THEM,
      mine: false,
      updatedAt: 20,
      // They kept the front shot and deleted the back one.
      payload: [shot({ id: 'old-front', memberId: THEM, facing: 'front', updatedAt: 20 })],
    };
    expect(await applyPulled([entry])).toBe(1);
    const here = await db.workoutPhotos.where('memberId').equals(THEM).toArray();
    expect(here.map((s) => s.id)).toEqual(['old-front']);
  });

  it('keeps the local day when the incoming one is older', async () => {
    await db.workoutPhotos.put(shot({ id: 'mine', memberId: THEM, updatedAt: 30 }));
    const entry: PulledEntry = {
      id: 'x', kind: 'photo', day: '2026-03-01', memberId: THEM, mine: false,
      updatedAt: 20, payload: [shot({ id: 'stale', memberId: THEM, updatedAt: 20 })],
    };
    expect(await applyPulled([entry])).toBe(0);
    expect((await db.workoutPhotos.toArray()).map((s) => s.id)).toEqual(['mine']);
  });
});

describe('partitionSendable', () => {
  const entry = (kind: EntryKind, payload: unknown, id = 'e'): WireEntry =>
    ({ id, kind, day: '2026-03-01', payload, updatedAt: 1 });

  it('lets an ordinary day through', () => {
    const { sendable, oversize } = partitionSendable([entry('mood', { joy: 7 })]);
    expect(sendable).toHaveLength(1);
    expect(oversize).toHaveLength(0);
  });

  it('holds back a photo day past its own ceiling', () => {
    const huge = [{ dataUri: 'A'.repeat(600 * 1024) }];
    const { sendable, oversize } = partitionSendable([entry('photo', huge, 'big')]);
    expect(sendable).toHaveLength(0);
    expect(oversize.map((e) => e.id)).toEqual(['big']);
  });

  it('gives photo the larger ceiling — a proof day is not a mood', () => {
    // 300 KiB: over the 64 KiB every other kind gets, under photo's 512 KiB.
    const payload = [{ dataUri: 'A'.repeat(300 * 1024) }];
    expect(partitionSendable([entry('photo', payload)]).sendable).toHaveLength(1);
    expect(partitionSendable([entry('mood', payload)]).oversize).toHaveLength(1);
  });

  it('an oversize row does not hold back the rows behind it', () => {
    const rows = [
      entry('photo', [{ dataUri: 'A'.repeat(600 * 1024) }], 'doomed'),
      entry('mood', { joy: 7 }, 'mood-1'),
      entry('cycle', { flow: 'light' }, 'cycle-1'),
    ];
    const { sendable, oversize } = partitionSendable(rows);
    expect(sendable.map((e) => e.id)).toEqual(['mood-1', 'cycle-1']);
    expect(oversize.map((e) => e.id)).toEqual(['doomed']);
  });
});

describe('chunkForPush', () => {
  const small = (id: string): WireEntry =>
    ({ id, kind: 'mood', day: '2026-03-01', payload: { joy: 1 }, updatedAt: 1 });

  it('sends one request when everything fits', () => {
    expect(chunkForPush([small('a'), small('b')])).toHaveLength(1);
  });

  it('splits on count', () => {
    const rows = Array.from({ length: 5 }, (_, i) => small(`e${i}`));
    expect(chunkForPush(rows, 2).map((c) => c.length)).toEqual([2, 2, 1]);
  });

  it('splits on bytes before count — 200 proofs is not one request', () => {
    const big = (id: string): WireEntry => ({
      id, kind: 'photo', day: '2026-03-01', updatedAt: 1,
      payload: [{ dataUri: 'A'.repeat(400 * 1024) }],
    });
    const chunks = chunkForPush([big('a'), big('b'), big('c')], 200, 1024 * 1024);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(2);
  });

  it('gives an over-budget row its own request rather than dropping it', () => {
    const enormous: WireEntry = {
      id: 'huge', kind: 'photo', day: '2026-03-01', updatedAt: 1,
      payload: [{ dataUri: 'A'.repeat(2 * 1024 * 1024) }],
    };
    const chunks = chunkForPush([enormous, small('after')], 200, 1024 * 1024);
    expect(chunks[0].map((e) => e.id)).toEqual(['huge']);
    expect(chunks.flat().map((e) => e.id)).toEqual(['huge', 'after']);
  });

  it('never loses an entry and never loops', () => {
    const rows = Array.from({ length: 17 }, (_, i) => small(`e${i}`));
    expect(chunkForPush(rows, 4).flat().map((e) => e.id)).toEqual(rows.map((e) => e.id));
  });

  it('has nothing to send when nothing is pending', () => {
    expect(chunkForPush([])).toEqual([]);
  });
});

describe('isPermanentRefusal', () => {
  it('treats the sizes and shapes the server will never accept as permanent', () => {
    expect(isPermanentRefusal(413)).toBe(true);
    expect(isPermanentRefusal(400)).toBe(true);
  });

  it('treats a server that is having a bad day as retryable', () => {
    for (const status of [500, 502, 503, 504, 429]) {
      expect(isPermanentRefusal(status)).toBe(false);
    }
  });

  it('does not discard rows because a token expired', () => {
    // 401 means re-pair, not "throw away what was waiting to be sent".
    expect(isPermanentRefusal(401)).toBe(false);
    expect(isPermanentRefusal(403)).toBe(false);
  });
});

/**
 * The wedge itself, driven end to end.
 *
 * Everything above tests a piece. This tests the thing that actually went
 * wrong: one row the server will not take, and whether the day log behind it
 * keeps moving.
 */
describe('sync() past a row the server refuses', () => {
  const seen: Array<{ ids: string[] }> = [];

  const seed = async () => {
    await saveSettings({
      memberId: ME,
      coupleId: 'couple-1',
      workerSecret: 'token',
      syncPushedAt: 0,
      syncPulledAt: 0,
    });
  };

  beforeEach(async () => {
    seen.length = 0;
    await Promise.all([
      db.moods.clear(), db.exercises.clear(), db.cycles.clear(),
      db.work.clear(), db.workoutPhotos.clear(), db.settings.clear(),
    ]);
    await seed();
  });

  /** A server that names the oversize row instead of refusing the batch. */
  const namingServer = (refuse: (id: string) => boolean) =>
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { entries: WireEntry[] };
        seen.push({ ids: body.entries.map((e) => e.id) });
        const rejected = body.entries.filter((e) => refuse(e.id)).map((e) => ({ id: e.id }));
        return new Response(
          JSON.stringify({ ok: true, written: body.entries.length - rejected.length, rejected }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toContain('/api/entries?since=');
      return new Response(JSON.stringify({ entries: [], cursor: 0, more: false }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };

  it('advances the watermark past a refused row, so the next round is clean', async () => {
    await putCycle(ME, '2026-03-01', { flow: 'light' });
    await db.workoutPhotos.put({
      id: 'proof', memberId: ME, day: '2026-03-02', facing: 'front',
      dataUri: 'data:image/jpeg;base64,AAAA', bytes: 4, updatedAt: Date.now() + 1000,
    });

    vi.stubGlobal('fetch', namingServer((id) => id.includes('-photo-')));
    const first = await sync();

    expect(first).not.toBeNull();
    expect(first!.skipped).toBe(1);
    // The cycle went, the proof did not, and neither threw.
    expect(seen[0].ids.some((id) => id.includes('-photo-'))).toBe(true);

    // Second round: the watermark has moved past both, so there is nothing
    // left to offer. Before the fix this re-sent the doomed row forever.
    seen.length = 0;
    const second = await sync();
    expect(second!.pushed).toBe(0);
    expect(second!.skipped).toBe(0);
    expect(seen).toEqual([]);
  });

  it('leaves the watermark alone when the server is merely down', async () => {
    await putCycle(ME, '2026-03-01', { flow: 'light' });
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }));

    await expect(sync()).rejects.toThrow(/503/);

    // Nothing was lost: the row is still pending for the next foreground.
    const settings = await loadSettings();
    expect(settings.syncPushedAt ?? 0).toBe(0);
    expect(await collectPending(ME, 0)).toHaveLength(1);
  });

  it('bisects a batch the server refuses without naming a row', async () => {
    // The old whole-batch 413, from a server that has not been updated.
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      await putCycle(ME, `2026-03-0${i + 1}`, { flow: 'light' });
    }
    await db.workoutPhotos.put({
      id: 'proof', memberId: ME, day: '2026-03-09', facing: 'front',
      dataUri: 'data:image/jpeg;base64,AAAA', bytes: 4, updatedAt: now + 5000,
    });

    vi.stubGlobal('fetch', async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { entries: WireEntry[] };
        seen.push({ ids: body.entries.map((e) => e.id) });
        const bad = body.entries.some((e) => e.kind === 'photo');
        if (bad) return new Response(JSON.stringify({ error: 'payload too large' }), { status: 413 });
        return new Response(JSON.stringify({ ok: true, written: body.entries.length, rejected: [] }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ entries: [], cursor: 0, more: false }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });

    const result = await sync();
    expect(result!.skipped).toBe(1);
    // The four good rows landed; only the proof was given up on.
    expect(result!.pushed).toBe(4);
    // The bisect reached a request holding the proof alone — that is how the
    // client learns which row it was, when the server will not say.
    const isolated = seen.find((r) => r.ids.length === 1 && r.ids[0].includes('-photo-'));
    expect(isolated).toBeDefined();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
