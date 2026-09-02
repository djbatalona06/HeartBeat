/**
 * The quests a couple can take on.
 *
 * A quest is a week with a number on it: pick a shape, pick how hard, and it
 * runs until it is finished or the week is out. Nothing happens when it is not
 * finished — the row is retired and that is the end of it. That is the
 * difference between this and a streak, and it is the whole reason quests are
 * safe to put in an app that has no punishment mechanics anywhere else.
 *
 * Every measure is counted in **days**, not events. "Move on four days" can be
 * checked off a table of workout rows; "do forty push-ups" cannot, and a target
 * the app cannot see the progress of is a target it would have to ask about.
 * Days are also the honest unit for a week-long quest.
 */

import type { QuestDifficulty } from '../types';

/** What a quest counts, each one a day the couple did something. */
export type QuestMeasure =
  | 'moodDays'
  | 'exerciseDays'
  | 'proofDays'
  | 'cycleDays'
  | 'planDays'
  | 'taskDays'
  | 'noteDays';

export interface QuestTemplate {
  id: string;
  measure: QuestMeasure;
  /** How many days at `steady`. The dial scales it. */
  base: number;
  /** Reads with the number in it: `title(4)` → "Move on four days". */
  title: (target: number) => string;
  /** One line under the title. Says what counts, so nothing is a surprise. */
  blurb: string;
}

/**
 * How hard, in one place.
 *
 * `scale` moves the target and `xp` moves the reward, and the two move together
 * so a harder quest is worth taking rather than merely longer. Seven days for
 * all three: the difficulty is how much fits in the week, not how long the week
 * is, which keeps every quest expiring on a schedule a person can hold in their
 * head.
 */
export interface QuestDial {
  scale: number;
  xp: number;
  days: number;
}

export const QUEST_DIAL: Record<QuestDifficulty, QuestDial> = {
  easy: { scale: 0.6, xp: 60, days: 7 },
  steady: { scale: 1, xp: 130, days: 7 },
  hard: { scale: 1.5, xp: 260, days: 7 },
};

export const QUEST_DIFFICULTIES: readonly QuestDifficulty[] = ['easy', 'steady', 'hard'];

/** Spelled out so a target reads as a sentence rather than a form field. */
const WORDS = [
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve',
] as const;

export function inWords(n: number): string {
  return WORDS[n] ?? String(n);
}

const days = (n: number) => (n === 1 ? 'one day' : `${inWords(n)} days`);

export const QUEST_TEMPLATES: readonly QuestTemplate[] = [
  {
    id: 'move',
    measure: 'exerciseDays',
    base: 4,
    title: (t) => `Move on ${days(t)}`,
    blurb: 'Any workout logged on the Move tab counts the day.',
  },
  {
    id: 'check-in',
    measure: 'moodDays',
    base: 5,
    title: (t) => `Say how it went, ${days(t)}`,
    blurb: 'One mood logged is one day, however the day actually was.',
  },
  {
    id: 'proof',
    measure: 'proofDays',
    base: 3,
    title: (t) => `Show your work on ${days(t)}`,
    blurb: 'A day with camera proof on it, either camera.',
  },
  {
    id: 'plan',
    measure: 'planDays',
    base: 3,
    title: (t) => `Put something in the diary on ${days(t)}`,
    blurb: 'A day you added anything to the calendar.',
  },
  {
    id: 'finish',
    measure: 'taskDays',
    base: 5,
    title: (t) => `Finish something on ${days(t)}`,
    blurb: 'A day you ticked at least one task off.',
  },
  {
    id: 'talk',
    measure: 'noteDays',
    base: 4,
    title: (t) => `Leave a note on ${days(t)}`,
    blurb: 'A day you wrote to the other phone.',
  },
  {
    id: 'track',
    measure: 'cycleDays',
    base: 5,
    title: (t) => `Keep track on ${days(t)}`,
    blurb: 'A day logged on the cycle tab.',
  },
];

export function templateById(id: string): QuestTemplate | undefined {
  return QUEST_TEMPLATES.find((t) => t.id === id);
}

export interface QuestShape {
  templateId: string;
  measure: QuestMeasure;
  difficulty: QuestDifficulty;
  title: string;
  /** Carried on the shape so a screen never has to reach for the template. */
  blurb: string;
  target: number;
  xp: number;
  days: number;
}

/**
 * What one template at one difficulty actually asks for.
 *
 * The target is rounded and floored at one: `easy` on a three-day template is
 * 1.8, and a quest asking for 1.8 days of anything is not a quest. Floored at
 * one rather than zero for the obvious reason — a target of zero is complete
 * the moment it is created, and would pay out for nothing.
 */
export function shapeFor(template: QuestTemplate, difficulty: QuestDifficulty): QuestShape {
  const dial = QUEST_DIAL[difficulty];
  const target = Math.max(1, Math.round(template.base * dial.scale));
  return {
    templateId: template.id,
    measure: template.measure,
    difficulty,
    title: template.title(target),
    blurb: template.blurb,
    target,
    xp: dial.xp,
    days: dial.days,
  };
}

/** Every shape on offer at one difficulty, in catalogue order. */
export function shapesAt(difficulty: QuestDifficulty): QuestShape[] {
  return QUEST_TEMPLATES.map((t) => shapeFor(t, difficulty));
}
