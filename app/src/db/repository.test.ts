import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, loadSettings, saveSettings } from './database';
import {
  addXp, confirmMessage, draftMessage, mergeMessages, putCycle, putExercise, putMood,
  putWorkEvent, removeWorkEvent,
} from './repository';
import type { ChatMessage } from '../domain/types';

/**
 * The repository is thin, but not trivial: each writer upserts on a composite
 * (member, day) index, and putCycle deletes rather than stores an empty draft.
 * Both are the kind of rule that breaks silently — you get duplicate rows per
 * day, or a blank check-in that counts as a real one — so they are pinned here.
 */

const ME = 'member-a';
const THEM = 'member-b';
const DAY = '2026-09-25';

beforeEach(async () => {
  await Promise.all([
    db.moods.clear(), db.exercises.clear(), db.cycles.clear(),
    db.work.clear(), db.messages.clear(), db.pet.clear(), db.settings.clear(),
  ]);
});

describe('putMood', () => {
  it('writes one row for a day', async () => {
    await putMood(ME, DAY, { hunger: 4, joy: 8, moody: 2 });
    const rows = await db.moods.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ memberId: ME, day: DAY, joy: 8 });
  });

  it('edits in place rather than stacking a second row', async () => {
    await putMood(ME, DAY, { hunger: 4, joy: 8, moody: 2 });
    const first = (await db.moods.toArray())[0];
    await putMood(ME, DAY, { hunger: 9, joy: 3, moody: 7 });

    const rows = await db.moods.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].joy).toBe(3);
  });

  it('keeps the two partners\' days separate', async () => {
    await putMood(ME, DAY, { hunger: 4, joy: 8, moody: 2 });
    await putMood(THEM, DAY, { hunger: 1, joy: 5, moody: 9 });
    expect(await db.moods.count()).toBe(2);
  });

  it('keeps one member\'s separate days separate', async () => {
    await putMood(ME, DAY, { hunger: 4, joy: 8, moody: 2 });
    await putMood(ME, '2026-09-26', { hunger: 4, joy: 8, moody: 2 });
    expect(await db.moods.count()).toBe(2);
  });
});

describe('putExercise', () => {
  it('upserts on the same day', async () => {
    await putExercise(ME, DAY, { sets: [{ name: 'squat', reps: 5 }] });
    await putExercise(ME, DAY, { sets: [{ name: 'squat', reps: 8 }] });
    const rows = await db.exercises.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].sets[0].reps).toBe(8);
  });
});

describe('putCycle', () => {
  it('stores a real entry', async () => {
    await putCycle(ME, DAY, { flow: 'medium' });
    expect(await db.cycles.count()).toBe(1);
  });

  it('stores a symptom-free check-in, which is not the same as no entry', async () => {
    await putCycle(ME, DAY, { checkInComplete: true });
    const rows = await db.cycles.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].checkInComplete).toBe(true);
  });

  it('does not store an empty draft', async () => {
    await putCycle(ME, DAY, {});
    expect(await db.cycles.count()).toBe(0);
  });

  it('does not store a draft whose only field is an empty symptom list', async () => {
    await putCycle(ME, DAY, { symptoms: [] });
    expect(await db.cycles.count()).toBe(0);
  });

  it('deletes an existing row when it is emptied out', async () => {
    await putCycle(ME, DAY, { flow: 'heavy' });
    expect(await db.cycles.count()).toBe(1);
    await putCycle(ME, DAY, {});
    expect(await db.cycles.count()).toBe(0);
  });

  it('keeps the row when only the flow is cleared but a note remains', async () => {
    await putCycle(ME, DAY, { flow: 'heavy', notes: 'rough one' });
    await putCycle(ME, DAY, { notes: 'rough one' });
    const rows = await db.cycles.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].flow).toBeUndefined();
    expect(rows[0].notes).toBe('rough one');
  });
});

describe('settings', () => {
  it('returns defaults before anything is stored', async () => {
    const settings = await loadSettings();
    expect(settings.themeId).toBe('kitty');
    expect(settings.onboarded).toBe(false);
  });

  it('merges a patch over the defaults', async () => {
    await saveSettings({ themeId: 'shinobi' });
    const settings = await loadSettings();
    expect(settings.themeId).toBe('shinobi');
    // Untouched fields keep their default rather than becoming undefined.
    expect(settings.timeZone).toBe('America/Los_Angeles');
  });

  it('stays a single row across repeated saves', async () => {
    await saveSettings({ themeId: 'pony' });
    await saveSettings({ calmMode: true });
    expect(await db.settings.count()).toBe(1);
    const settings = await loadSettings();
    expect(settings.themeId).toBe('pony');
    expect(settings.calmMode).toBe(true);
  });
});

describe('addXp', () => {
  it('creates the pet on first award', async () => {
    await addXp('couple-1', 40);
    expect((await db.pet.get('couple-1'))?.xp).toBe(40);
  });

  it('accumulates rather than replacing', async () => {
    await addXp('couple-1', 40);
    await addXp('couple-1', 25);
    expect((await db.pet.get('couple-1'))?.xp).toBe(65);
  });
});


describe('putWorkEvent', () => {
  // The whole point of the calendar: unlike mood or exercise, a day holds many
  // events. If these ever collapse to one row per day, a second appointment
  // silently overwrites the first.
  it('keeps several events on the same day', async () => {
    await putWorkEvent(ME, DAY, { title: 'Dentist', startsAt: 540, source: 'manual' });
    await putWorkEvent(ME, DAY, { title: 'Lunch', startsAt: 720, source: 'manual' });

    const rows = await db.work.where('[memberId+day]').equals([ME, DAY]).toArray();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title).sort()).toEqual(['Dentist', 'Lunch']);
  });

  it('returns the new id, and edits in place when given one back', async () => {
    const eventId = await putWorkEvent(ME, DAY, {
      title: 'Dentist', startsAt: 540, source: 'manual',
    });
    await putWorkEvent(ME, DAY, { title: 'Dentist, moved', startsAt: 600, source: 'manual' }, eventId);

    const rows = await db.work.where('[memberId+day]').equals([ME, DAY]).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Dentist, moved');
    expect(rows[0].startsAt).toBe(600);
    expect(rows[0].id).toBe(eventId);
  });

  it('moves an event to another day without leaving a copy behind', async () => {
    const eventId = await putWorkEvent(ME, DAY, { title: 'Flight', startsAt: 480, source: 'manual' });
    await putWorkEvent(ME, '2026-09-26', { title: 'Flight', startsAt: 480, source: 'manual' }, eventId);

    expect(await db.work.where('[memberId+day]').equals([ME, DAY]).count()).toBe(0);
    expect(await db.work.where('[memberId+day]').equals([ME, '2026-09-26']).count()).toBe(1);
  });

  it('keeps the two members’ calendars apart', async () => {
    await putWorkEvent(ME, DAY, { title: 'Mine', startsAt: 540, source: 'manual' });
    await putWorkEvent(THEM, DAY, { title: 'Theirs', startsAt: 540, source: 'manual' });

    const mine = await db.work.where('[memberId+day]').equals([ME, DAY]).toArray();
    expect(mine.map((r) => r.title)).toEqual(['Mine']);
  });

  it('trims the title and refuses an empty one', async () => {
    const eventId = await putWorkEvent(ME, DAY, { title: '  Dentist  ', startsAt: 540, source: 'manual' });
    expect((await db.work.get(eventId))?.title).toBe('Dentist');

    // An untitled event is unreadable in a month grid, and you only find out
    // after it is saved.
    await expect(
      putWorkEvent(ME, DAY, { title: '   ', startsAt: 540, source: 'manual' }),
    ).rejects.toThrow(/title/);
  });

  it('stores an all-day event with no start time', async () => {
    const eventId = await putWorkEvent(ME, DAY, { title: 'Her birthday', source: 'manual' });
    const row = await db.work.get(eventId);
    expect(row?.startsAt).toBeUndefined();
    expect(row?.title).toBe('Her birthday');
  });
});

describe('removeWorkEvent', () => {
  it('deletes one event and leaves the rest of the day alone', async () => {
    const doomed = await putWorkEvent(ME, DAY, { title: 'Cancelled', startsAt: 540, source: 'manual' });
    await putWorkEvent(ME, DAY, { title: 'Still on', startsAt: 720, source: 'manual' });

    await removeWorkEvent(doomed);

    const rows = await db.work.where('[memberId+day]').equals([ME, DAY]).toArray();
    expect(rows.map((r) => r.title)).toEqual(['Still on']);
  });
});


const COUPLE = 'couple-1';

describe('the message thread', () => {
  it('writes a draft locally and marks it pending', async () => {
    const row = await draftMessage(COUPLE, ME, '  how do I add a habit?  ');
    expect(row).not.toBeNull();
    expect(row?.body).toBe('how do I add a habit?');
    expect(row?.pending).toBe(true);
    expect(row?.mine).toBe(true);
    expect(await db.messages.count()).toBe(1);
  });

  it('refuses an empty message rather than storing a blank line', async () => {
    expect(await draftMessage(COUPLE, ME, '   ')).toBeNull();
    expect(await db.messages.count()).toBe(0);
  });

  // The whole point of an optimistic send: the local row must be replaced by
  // the server's, never joined by it.
  it('replaces the pending row with the server’s, leaving one message', async () => {
    const local = await draftMessage(COUPLE, ME, 'hello');
    const confirmed: ChatMessage = {
      id: 'server-id', coupleId: COUPLE, memberId: ME,
      body: 'hello', createdAt: 1234, mine: true,
    };
    await confirmMessage(local!.id, confirmed);

    const all = await db.messages.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('server-id');
    expect(all[0].pending).toBe(false);
  });

  it('folds a pull in without duplicating what it already has', async () => {
    const rows: ChatMessage[] = [
      { id: 'a', coupleId: COUPLE, memberId: THEM, body: 'first', createdAt: 1, mine: false },
      { id: 'b', coupleId: COUPLE, memberId: ME, body: 'second', createdAt: 2, mine: true },
    ];
    await mergeMessages(rows);
    // The same pull arriving twice — a retried poll — must not stack.
    await mergeMessages(rows);

    expect(await db.messages.count()).toBe(2);
  });

  it('lets a re-pull correct a message it already stored', async () => {
    await mergeMessages([
      { id: 'a', coupleId: COUPLE, memberId: THEM, body: 'typo', createdAt: 1, mine: false },
    ]);
    await mergeMessages([
      { id: 'a', coupleId: COUPLE, memberId: THEM, body: 'fixed', createdAt: 1, mine: false },
    ]);

    expect((await db.messages.get('a'))?.body).toBe('fixed');
  });

  it('does nothing at all on an empty pull', async () => {
    await mergeMessages([]);
    expect(await db.messages.count()).toBe(0);
  });

  it('reads back in the order things were said', async () => {
    await mergeMessages([
      { id: 'c', coupleId: COUPLE, memberId: ME, body: 'third', createdAt: 30, mine: true },
      { id: 'a', coupleId: COUPLE, memberId: THEM, body: 'first', createdAt: 10, mine: false },
      { id: 'b', coupleId: COUPLE, memberId: ME, body: 'second', createdAt: 20, mine: true },
    ]);

    const thread = await db.messages
      .where('[coupleId+createdAt]')
      .between([COUPLE, 0], [COUPLE, Infinity])
      .toArray();
    expect(thread.map((m) => m.body)).toEqual(['first', 'second', 'third']);
  });
});
