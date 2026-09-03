import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, saveSettings } from './database';
import {
  activeQuest,
  pastQuests,
  putMood,
  reconcileQuests,
  retireQuest,
  startQuest,
  suggestQuests,
} from './repository';
import { QUEST_DIAL, shapeFor, templateById } from '../domain/quests/templates';

/**
 * The one thing that must not go wrong: a quest paying twice.
 *
 * Everything else here is a convenience. This is the money.
 */

const COUPLE = 'couple-1';
const ME = 'member-a';
const THEM = 'member-b';
const TODAY = '2026-03-01';
const TZONE = 'America/Los_Angeles';

const CHECK_IN = shapeFor(templateById('check-in')!, 'easy');

const mood = (memberId: string, day: string) =>
  putMood(memberId, day, { hunger: 5, joy: 6, moody: 3 });

beforeEach(async () => {
  await Promise.all([
    db.quests.clear(), db.moods.clear(), db.exercises.clear(), db.cycles.clear(),
    db.work.clear(), db.workoutPhotos.clear(), db.messages.clear(), db.tasks.clear(),
    db.pet.clear(),
  ]);
});

describe('startQuest', () => {
  it('mints one from a template and a difficulty', async () => {
    const quest = await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    expect(quest?.templateId).toBe('check-in');
    expect(quest?.difficulty).toBe('easy');
    expect(quest?.target).toBe(CHECK_IN.target);
    expect(quest?.progress).toBe(0);
    expect(quest?.startedOn).toBe(TODAY);
  });

  it('refuses a template that does not exist', async () => {
    expect(await startQuest(COUPLE, 'nothing', 'easy', TODAY)).toBeNull();
    expect(await db.quests.count()).toBe(0);
  });

  /** Losing a week's progress to a mis-tap is not recoverable. */
  it('refuses a second quest while one is running, rather than replacing it', async () => {
    const first = await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    const second = await startQuest(COUPLE, 'move', 'hard', TODAY);

    expect(second).toBeNull();
    expect((await activeQuest(COUPLE))?.id).toBe(first!.id);
    expect(await db.quests.count()).toBe(1);
  });

  it('allows a new one once the last is settled', async () => {
    const first = await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    await retireQuest(first!.id);
    const second = await startQuest(COUPLE, 'move', 'steady', TODAY);
    expect(second).not.toBeNull();
    expect((await activeQuest(COUPLE))?.id).toBe(second!.id);
  });

  it('leaves another couple’s quest out of it', async () => {
    await startQuest('couple-2', 'move', 'easy', TODAY);
    const mine = await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    expect(mine).not.toBeNull();
  });
});

describe('reconcileQuests', () => {
  it('does nothing at all when there is no quest', async () => {
    const result = await reconcileQuests(COUPLE, TODAY, TZONE);
    expect(result).toEqual({ awarded: 0, finished: false, expired: false });
    expect(await db.pet.get(COUPLE)).toBeUndefined();
  });

  it('counts the days towards the target', async () => {
    await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    await mood(ME, TODAY);
    await mood(ME, '2026-03-02');

    const result = await reconcileQuests(COUPLE, '2026-03-02', TZONE);
    expect(result.quest?.progress).toBe(2);
    expect(result.finished).toBe(false);
    expect(result.awarded).toBe(0);
  });

  it('counts a day once however many rows land on it', async () => {
    await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    // Both people, same day. One day.
    await mood(ME, TODAY);
    await mood(THEM, TODAY);
    expect((await reconcileQuests(COUPLE, TODAY, TZONE)).quest?.progress).toBe(1);
  });

  it('counts both people, because the quest belongs to the couple', async () => {
    await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    await mood(ME, TODAY);
    await mood(THEM, '2026-03-02');
    expect((await reconcileQuests(COUPLE, '2026-03-02', TZONE)).quest?.progress).toBe(2);
  });

  it('ignores days outside the quest’s own window', async () => {
    await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    await mood(ME, '2026-02-20');       // before it started
    await mood(ME, '2026-03-20');       // after it ended
    await mood(ME, TODAY);
    expect((await reconcileQuests(COUPLE, TODAY, TZONE)).quest?.progress).toBe(1);
  });

  it('pays out on the transition to complete', async () => {
    await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    for (let i = 0; i < CHECK_IN.target; i += 1) {
      await mood(ME, `2026-03-0${i + 1}`);
    }

    const result = await reconcileQuests(COUPLE, '2026-03-05', TZONE);
    expect(result.finished).toBe(true);
    expect(result.awarded).toBe(QUEST_DIAL.easy.xp);
    expect((await db.pet.get(COUPLE))?.xp).toBe(QUEST_DIAL.easy.xp);
  });

  /** The rule. Everything above is setup for this. */
  it('pays once, however many times it is reconciled', async () => {
    await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    for (let i = 0; i < CHECK_IN.target; i += 1) await mood(ME, `2026-03-0${i + 1}`);

    const first = await reconcileQuests(COUPLE, '2026-03-05', TZONE);
    const second = await reconcileQuests(COUPLE, '2026-03-05', TZONE);
    const third = await reconcileQuests(COUPLE, '2026-03-06', TZONE);

    expect(first.awarded).toBe(QUEST_DIAL.easy.xp);
    expect(second.awarded).toBe(0);
    expect(third.awarded).toBe(0);
    expect((await db.pet.get(COUPLE))?.xp).toBe(QUEST_DIAL.easy.xp);
  });

  it('pays once when two reconciles overlap', async () => {
    await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    for (let i = 0; i < CHECK_IN.target; i += 1) await mood(ME, `2026-03-0${i + 1}`);

    // What a live query firing on this function's own write looks like.
    await Promise.all([
      reconcileQuests(COUPLE, '2026-03-05', TZONE),
      reconcileQuests(COUPLE, '2026-03-05', TZONE),
    ]);

    expect((await db.pet.get(COUPLE))?.xp).toBe(QUEST_DIAL.easy.xp);
  });

  it('pays nothing more when the days keep coming after it finished', async () => {
    await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    for (let i = 0; i < CHECK_IN.target; i += 1) await mood(ME, `2026-03-0${i + 1}`);
    await reconcileQuests(COUPLE, '2026-03-05', TZONE);

    await mood(ME, '2026-03-06');
    await mood(ME, '2026-03-07');
    const after = await reconcileQuests(COUPLE, '2026-03-07', TZONE);

    expect(after.awarded).toBe(0);
    expect((await db.pet.get(COUPLE))?.xp).toBe(QUEST_DIAL.easy.xp);
  });

  it('retires an unfinished quest when its week runs out, and takes nothing', async () => {
    await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    await mood(ME, TODAY);

    const result = await reconcileQuests(COUPLE, '2026-03-20', TZONE);
    expect(result.expired).toBe(true);
    expect(result.awarded).toBe(0);
    // No pet row at all: nothing was added and nothing was taken away.
    expect(await db.pet.get(COUPLE)).toBeUndefined();
    expect(await activeQuest(COUPLE)).toBeUndefined();
  });

  it('counts a quest finished on its last day as finished', async () => {
    const quest = await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    for (let i = 0; i < CHECK_IN.target; i += 1) await mood(ME, `2026-03-0${i + 1}`);

    const result = await reconcileQuests(COUPLE, quest!.endsOn!, TZONE);
    expect(result.finished).toBe(true);
    expect(result.expired).toBe(false);
  });

  it('survives a stored quest whose template has been renamed away', async () => {
    const quest = await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    await db.quests.put({ ...quest!, templateId: 'retired' });
    const result = await reconcileQuests(COUPLE, TODAY, TZONE);
    expect(result.awarded).toBe(0);
  });
});

describe('pastQuests', () => {
  it('reads finished and let-go quests, newest first', async () => {
    const a = await startQuest(COUPLE, 'check-in', 'easy', TODAY);
    await db.quests.put({ ...a!, retiredAt: 100 });
    const b = await startQuest(COUPLE, 'move', 'easy', TODAY);
    await db.quests.put({ ...b!, completedAt: 300 });
    const c = await startQuest(COUPLE, 'plan', 'easy', TODAY);

    const past = await pastQuests(COUPLE);
    expect(past.map((q) => q.id)).toEqual([b!.id, a!.id]);
    // The one still running is not in the past.
    expect(past.map((q) => q.id)).not.toContain(c!.id);
  });
});

describe('suggestQuests', () => {
  it('offers every template, with a difficulty to open on', async () => {
    const { difficulty, shapes } = await suggestQuests(TODAY);
    expect(shapes.length).toBeGreaterThan(0);
    expect(['easy', 'steady', 'hard']).toContain(difficulty);
  });

  it('starts a couple who have done nothing on easy', async () => {
    expect((await suggestQuests(TODAY)).difficulty).toBe('easy');
  });

  it('offers something harder to a couple already at it', async () => {
    for (let i = 1; i <= 6; i += 1) await mood(ME, `2026-02-2${i}`);
    expect((await suggestQuests('2026-02-27')).difficulty).not.toBe('easy');
  });
});

/**
 * What the measures actually count.
 *
 * Two of these were wrong in a way no unit test could see: they only show up
 * against real rows, and both handed out XP for work nobody did in the week.
 */
describe('what a quest counts', () => {
  beforeEach(async () => {
    await saveSettings({ timeZone: TZONE });
  });

  /**
   * A calendar holds next week's dentist appointment. Counting by the day an
   * event *happens* meant two things already in the diary finished the quest
   * on its first reconcile, before the couple had done anything at all.
   */
  it('does not finish a calendar quest on things already in the diary', async () => {
    const shape = shapeFor(templateById('plan')!, 'easy');
    // Events sitting in the coming week, written long before the quest began.
    for (let i = 0; i < shape.target + 2; i += 1) {
      await db.work.put({
        id: `pre-${i}`,
        memberId: ME,
        day: `2026-03-0${i + 2}`,
        title: 'Dentist',
        source: 'manual',
        updatedAt: Date.parse('2026-01-01T12:00:00Z'),
      });
    }

    await startQuest(COUPLE, 'plan', 'easy', TODAY);
    const result = await reconcileQuests(COUPLE, TODAY, TZONE);

    expect(result.finished).toBe(false);
    expect(result.awarded).toBe(0);
    expect(result.quest?.progress).toBe(0);
  });

  it('counts the day something was put in the diary', async () => {
    await startQuest(COUPLE, 'plan', 'easy', TODAY);
    await db.work.put({
      id: 'today',
      memberId: ME,
      day: '2026-12-25',
      title: 'Christmas',
      // Written during the quest, for a day months away.
      updatedAt: Date.parse(`${TODAY}T18:00:00Z`),
      source: 'manual',
    });

    expect((await reconcileQuests(COUPLE, TODAY, TZONE)).quest?.progress).toBe(1);
  });

  /**
   * An evening note west of Greenwich lands on the next UTC day. Deriving the
   * day in UTC therefore pushed it outside the window, so a note written on
   * the quest's last evening never counted.
   */
  it('puts an evening note on the evening it was written', async () => {
    const quest = await startQuest(COUPLE, 'talk', 'easy', TODAY);
    // 20:00 in Los Angeles on the quest's last day is 04:00 UTC the next day.
    const evening = Date.parse(`${quest!.endsOn!}T20:00:00-08:00`);
    await db.messages.put({
      id: 'n1', memberId: ME, coupleId: COUPLE, body: 'night', createdAt: evening, mine: true,
    });

    expect((await reconcileQuests(COUPLE, quest!.endsOn!, TZONE)).quest?.progress).toBe(1);
  });
});
