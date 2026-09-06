import { db, loadSettings } from '../database';
import type { DayKey } from '../../domain/types';
import { addDays, dayKey } from '../../domain/day';
import { instantAt } from '../../domain/notify/schedule';
import { id, now } from './shared';
import { awardPetXp } from './petXp';


/* ---- quests --------------------------------------------------------------- */

/**
 * The couple's quest, and the one place it is paid for.
 *
 * `quests` is the other table that has been in the schema since v1 with nothing
 * writing to it. `domain/quests/` decides; this composes it with one write, and
 * `domain/xp.ts`'s `questComplete`/`awardFor` — which have been sitting there
 * without a caller since the repository began — do the arithmetic.
 *
 * The rule everything below serves: **a quest pays out once, on the transition
 * to complete.** `completedAt` records the transition and `reckon` refuses to
 * award a quest carrying it, so the danger is not the rule but the gap between
 * reading a quest and writing it back. `reconcileQuests` therefore re-reads the
 * row inside the transaction it writes in: two overlapping reconciles — which a
 * live query firing on this function's own writes will produce — cannot both
 * see an unpaid quest.
 *
 * Progress is measured rather than incremented. Counting the days a quest's
 * measure names, every time, means a workout logged while the app was closed,
 * or a row that arrived by sync, lands in the quest anyway; an increment hung
 * off `completeTask` would simply have been missed.
 */
import {
  advance,
  markComplete,
  markRetired,
  newQuest,
  reckon,
  seedFrom,
  suggestDifficulty,
  type RecentDays,
} from '../../domain/quests/engine';
import {
  QUEST_TEMPLATES,
  shapeFor,
  shapesAt,
  templateById,
  type QuestMeasure,
  type QuestShape,
} from '../../domain/quests/templates';
import type { Quest, QuestDifficulty } from '../../domain/types';

/** How far back `suggest` looks when guessing what to offer. */
const SEED_WINDOW_DAYS = 14;

/** The instant a day is over, so `expiresAt` keeps meaning what it always did. */
function endOfDay(day: DayKey, timeZone: string): number {
  // The day key is derived in the member's zone, so its end has to be too:
  // ending a London quest at midnight UTC cuts an hour off its last day in
  // summer, and a Los Angeles one loses most of an afternoon.
  const midnight = instantAt(day, 0, timeZone);
  return instantAt(addDays(day, 1), 0, timeZone) - 1 || midnight;
}


/**
 * How many days of each measure fall inside a window.
 *
 * Every table here holds one couple's rows and no one else's, so both people's
 * days count towards the quest — it belongs to the couple, like the pet it
 * feeds and unlike a task.
 */
async function daysByMeasure(
  timeZone: string,
  from?: DayKey,
  to?: DayKey,
): Promise<Record<QuestMeasure, number>> {
  const inWindow = (day: DayKey | undefined): day is DayKey =>
    Boolean(day) && (!from || day! >= from) && (!to || day! <= to);

  /**
   * Distinct days a table has rows on, streamed.
   *
   * `workoutPhotos` carries a base64 JPEG per row, so reading the table into an
   * array to look at each `day` is how a phone with a year of proof runs out of
   * memory — and this runs on every reconcile and every live-query re-fire.
   */
  const daysOf = async (
    table: { each(fn: (row: { day?: string }) => void): Promise<unknown> },
  ): Promise<number> => {
    const days = new Set<DayKey>();
    await table.each((row) => { if (inWindow(row.day)) days.add(row.day as DayKey); });
    return days.size;
  };

  const [moodDays, exerciseDays, proofDays, cycleDays, planDays, tasks, notes] = await Promise.all([
    daysOf(db.moods),
    daysOf(db.exercises),
    daysOf(db.workoutPhotos),
    daysOf(db.cycles),
    // The day the entry was *written*, not the day it is for. A calendar holds
    // next week's dentist appointment; counting by the day it happens meant two
    // things already in the diary finished the quest on its first reconcile and
    // paid out for work nobody did during the week.
    (async () => {
      const days = new Set<DayKey>();
      await db.work.each((row) => {
        const on = dayKey(new Date(row.updatedAt), timeZone);
        if (inWindow(on)) days.add(on);
      });
      return days.size;
    })(),
    db.tasks.toArray(),
    (async () => {
      const days = new Set<DayKey>();
      // In the member's zone, like every other day key here. Deriving this one
      // in UTC put an evening note on the following day for anyone west of
      // Greenwich, so a note written on the quest's last evening never counted.
      await db.messages.each((m) => {
        const on = dayKey(new Date(m.createdAt), timeZone);
        if (inWindow(on)) days.add(on);
      });
      return days.size;
    })(),
  ]);

  return {
    moodDays,
    exerciseDays,
    proofDays,
    cycleDays,
    planDays,
    // Distinct tasks whose most recent completion falls in the window. A task
    // records only that one date, so this cannot be a count of days — see the
    // note on the `finish` template, which is worded to match.
    tasksFinished: tasks.filter((t) => inWindow(t.lastCompletedOn)).length,
    noteDays: notes,
  };
}

/** The couple's quest, if they have one running. */
export async function activeQuest(coupleId: string): Promise<Quest | undefined> {
  const rows = await db.quests.where('coupleId').equals(coupleId).toArray();
  return rows.find((q) => !q.completedAt && !q.retiredAt);
}

/** Everything they have finished or let go, newest first. */
export async function pastQuests(coupleId: string): Promise<Quest[]> {
  const rows = await db.quests.where('coupleId').equals(coupleId).toArray();
  return rows
    .filter((q) => q.completedAt || q.retiredAt)
    .sort((a, b) => (b.completedAt ?? b.retiredAt ?? 0) - (a.completedAt ?? a.retiredAt ?? 0));
}

export interface QuestSuggestion {
  difficulty: QuestDifficulty;
  shapes: QuestShape[];
}

/**
 * What to offer, ordered by what they already do.
 *
 * The difficulty is a starting point rather than a decision — the picker shows
 * all three, and this only says which one it opens on.
 */
export async function suggestQuests(today: DayKey): Promise<QuestSuggestion> {
  const from = addDays(today, -SEED_WINDOW_DAYS);
  const { timeZone } = await loadSettings();
  const recent = (await daysByMeasure(timeZone, from, today)) as RecentDays;
  const difficulty = suggestDifficulty(recent);
  return { difficulty, shapes: seedFrom(shapesAt(difficulty), recent, SEED_WINDOW_DAYS) };
}

/**
 * Take one on.
 *
 * One at a time, on purpose: a list of quests is a backlog, and the point of a
 * quest is that it is the thing you are doing this week. Starting a new one
 * while another runs is refused rather than silently retiring the old one,
 * because losing a week's progress to a mis-tap is not recoverable.
 */
export async function startQuest(
  coupleId: string,
  templateId: string,
  difficulty: QuestDifficulty,
  today: DayKey,
): Promise<Quest | null> {
  const template = templateById(templateId);
  if (!template) return null;

  const { timeZone } = await loadSettings();

  return db.transaction('rw', [db.quests], async () => {
    const rows = await db.quests.where('coupleId').equals(coupleId).toArray();
    if (rows.some((q) => !q.completedAt && !q.retiredAt)) return null;

    const quest = newQuest(shapeFor(template, difficulty), coupleId, today, id(),
      (day) => endOfDay(day, timeZone));
    await db.quests.put(quest);
    return quest;
  });
}

/** Let one go early. Nothing is taken — the row is stamped and stops counting. */
export async function retireQuest(questId: string): Promise<void> {
  await db.transaction('rw', [db.quests], async () => {
    const quest = await db.quests.get(questId);
    if (!quest || quest.completedAt || quest.retiredAt) return;
    await db.quests.put(markRetired(quest, now()));
  });
}

/**
 * The zone is a parameter rather than something read from `settings` here, and
 * that is not tidiness. `QuestBoard` calls this inside a `useLiveQuery`, and a
 * Dexie live query subscribes to every table its body touches — `sync()`
 * rewrites the settings row at the end of every round, up to twenty rounds per
 * foreground, and each rewrite would re-stream `moods`, `exercises`,
 * `workoutPhotos`, `cycles`, `work`, `tasks` and `messages`. That is exactly
 * the cost `daysOf` streams to avoid, paid twenty times over.
 */
export interface QuestReading {
  quest?: Quest;
  /** Days counted for that quest's measure, inside its own window. */
  measured: number;
}

/**
 * The running quest and how far along it actually is.
 *
 * A read, so a screen can put it in a live query — and it must, because the
 * tables this touches are the ones a quest counts. A live query watching only
 * `quests` would never re-fire when a workout is logged, so the quest would sit
 * unreconciled until something else happened to write to it. Reading moods,
 * exercises and the rest *here* is what subscribes the caller to them.
 */
export async function measureQuest(coupleId: string, timeZone: string): Promise<QuestReading> {
  const rows = await db.quests.where('coupleId').equals(coupleId).toArray();
  const quest = rows.find((q) => !q.completedAt && !q.retiredAt);
  if (!quest) return { measured: 0 };

  const template = templateById(quest.templateId);
  if (!template) return { quest, measured: quest.progress };

  const counted = await daysByMeasure(timeZone, quest.startedOn, quest.endsOn);
  return { quest, measured: counted[template.measure] ?? 0 };
}

export interface QuestReckoning {
  quest?: Quest;
  /** Non-zero only on the reconcile that saw the transition to complete. */
  awarded: number;
  finished: boolean;
  expired: boolean;
}

/**
 * Bring the running quest up to date with what has actually happened.
 *
 * Safe to call as often as anything likes. With no quest, nothing new, or a
 * quest already settled, it writes nothing at all.
 */
export async function reconcileQuests(
  coupleId: string,
  today: DayKey,
  timeZone: string,
): Promise<QuestReckoning> {
  const { quest: running, measured } = await measureQuest(coupleId, timeZone);
  if (!running) return { awarded: 0, finished: false, expired: false };
  if (!templateById(running.templateId)) {
    return { quest: running, awarded: 0, finished: false, expired: false };
  }

  return db.transaction('rw', [db.quests, db.pet], async () => {
    // Re-read inside the transaction. The value fetched above is only a count;
    // whether this quest has already been paid is decided here, where a second
    // overlapping call cannot see a stale answer.
    const fresh = await db.quests.get(running.id);
    if (!fresh) return { awarded: 0, finished: false, expired: false };

    const step = reckon(advance(fresh, measured), today);

    if (step.verb === 'complete') {
      await db.quests.put(markComplete(step.quest, now()));
      // Named after the quest for the same reason the rungs are: an award id
      // the server has already seen is one it will not credit again.
      await awardPetXp(coupleId, `quest-${step.quest.id}`, step.award);
      return { quest: step.quest, awarded: step.award, finished: true, expired: false };
    }

    if (step.verb === 'expired') {
      await db.quests.put(markRetired(step.quest, now()));
      return { quest: step.quest, awarded: 0, finished: false, expired: true };
    }

    // Running, or already settled by whoever got here first.
    if (step.verb === 'running' && step.quest !== fresh) await db.quests.put(step.quest);
    return { quest: step.quest, awarded: 0, finished: false, expired: false };
  });
}

/** The templates, for a picker that wants to show what is on offer. */
export { QUEST_TEMPLATES };
