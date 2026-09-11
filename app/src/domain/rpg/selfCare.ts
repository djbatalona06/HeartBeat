import { AREA_IDS, type AreaId, type Task, type TaskDifficulty } from './types';

/**
 * The self-care catalogue: six areas of a life, and the small things that make
 * up each one.
 *
 * This is the one list. The starter plan a fresh install seeds used to hold its
 * own eighteen literals; it now selects out of this catalogue by id
 * (`starterPlan.ts`), so a person who opens Goals on day one sees the same
 * vocabulary the app already planted for them rather than a second, unrelated
 * set of suggestions that happens to overlap.
 *
 * Two things are deliberately absent. There is no colour here: colour comes
 * from the theme engine, and a catalogue of hardcoded hexes would be the one
 * thing on screen ignoring the pack the user picked — areas carry an `icon` and
 * the screens tint with `color-mix()` against `var(--color-accent)`. And there
 * is no difficulty above `medium`: a self-care suggestion that announces itself
 * as hard is a suggestion that gets skipped, and anything genuinely hard is a
 * goal somebody should be writing in their own words anyway.
 */

/** Areas carry an icon rather than a colour — see the note above. */
export interface Area {
  id: AreaId;
  name: string;
  /** One line, shown under the name on the areas grid. */
  blurb: string;
  icon: 'dumbbell' | 'cards' | 'mood' | 'friends' | 'house' | 'sparkle';
}

export const AREAS: readonly Area[] = [
  {
    id: 'body',
    name: 'Body',
    blurb: 'Sleep, water, food, moving, and the upkeep nobody claps for.',
    icon: 'dumbbell',
  },
  {
    id: 'mind',
    name: 'Mind',
    blurb: 'Attention, rest, and getting out from under your own head.',
    icon: 'cards',
  },
  {
    id: 'feelings',
    name: 'Feelings',
    blurb: 'Noticing what is actually going on, and being kind about it.',
    icon: 'mood',
  },
  {
    id: 'people',
    name: 'People',
    blurb: 'The ones you would miss. Keeping the thread from going quiet.',
    icon: 'friends',
  },
  {
    id: 'space',
    name: 'Space',
    blurb: 'The room you are in. Small tidying, air, light, one clear surface.',
    icon: 'house',
  },
  {
    id: 'purpose',
    name: 'Purpose',
    blurb: 'What you are for. Looking forward, and finishing something.',
    icon: 'sparkle',
  },
];

export function areaById(id: AreaId): Area | undefined {
  return AREAS.find((a) => a.id === id);
}

export interface Suggestion {
  /**
   * Stable forever: this is written onto a `Task` as `suggestionId` and read
   * back to tell whether a goal has already been adopted. Renaming a suggestion
   * is fine; renumbering one orphans everybody's goal.
   */
  id: string;
  title: string;
  area: AreaId;
  difficulty: TaskDifficulty;
}

/**
 * Ten or so per area. The order inside an area is the order the ideas screen
 * offers them in, easiest first, because the first thing on a list of
 * suggestions is the one that actually gets taken.
 */
export const SUGGESTIONS: readonly Suggestion[] = [
  // -- Body ----------------------------------------------------------------
  { id: 'body-teeth', title: 'Brush your teeth', area: 'body', difficulty: 'trivial' },
  { id: 'body-hair', title: 'Wash and brush your hair', area: 'body', difficulty: 'trivial' },
  { id: 'body-water', title: 'Drink water', area: 'body', difficulty: 'trivial' },
  { id: 'body-stretch', title: 'Take a stretch break', area: 'body', difficulty: 'trivial' },
  { id: 'body-move-two', title: 'Stand up and move for two minutes', area: 'body', difficulty: 'trivial' },
  { id: 'body-far', title: 'Look at something far away for a moment', area: 'body', difficulty: 'trivial' },
  { id: 'body-shoulders', title: 'Drop your shoulders and unclench your jaw', area: 'body', difficulty: 'trivial' },
  { id: 'body-real-food', title: 'Eat something that is not from a wrapper', area: 'body', difficulty: 'easy' },
  { id: 'body-walk', title: 'Go for a short walk', area: 'body', difficulty: 'easy' },
  { id: 'body-bed-time', title: 'Go to bed at the time you meant to', area: 'body', difficulty: 'medium' },
  { id: 'body-screen-off', title: 'Put screens down an hour before sleep', area: 'body', difficulty: 'medium' },

  // -- Mind ----------------------------------------------------------------
  { id: 'mind-breaths', title: 'Take three deep breaths', area: 'mind', difficulty: 'trivial' },
  { id: 'mind-one-thing', title: 'Do one thing at a time for ten minutes', area: 'mind', difficulty: 'easy' },
  { id: 'mind-phone-down', title: 'Put your phone down for ten minutes', area: 'mind', difficulty: 'easy' },
  { id: 'mind-brain-dump', title: 'Write down everything on your mind, unsorted', area: 'mind', difficulty: 'easy' },
  { id: 'mind-read', title: 'Read something that is not a feed', area: 'mind', difficulty: 'easy' },
  { id: 'mind-sit', title: 'Sit still for five minutes with nothing on', area: 'mind', difficulty: 'easy' },
  { id: 'mind-no-news', title: 'Skip the news for a day', area: 'mind', difficulty: 'medium' },
  { id: 'mind-smallest-step', title: 'Name the smallest next step and do only that', area: 'mind', difficulty: 'easy' },
  { id: 'mind-learn', title: 'Learn one small thing on purpose', area: 'mind', difficulty: 'easy' },
  { id: 'mind-single-tab', title: 'Close every tab but the one you are using', area: 'mind', difficulty: 'trivial' },

  // -- Feelings ------------------------------------------------------------
  { id: 'feel-happy-thing', title: 'Do one thing that makes you happy', area: 'feelings', difficulty: 'easy' },
  { id: 'feel-went-well', title: 'Write down one thing that went well', area: 'feelings', difficulty: 'trivial' },
  { id: 'feel-name-it', title: 'Name what you are feeling, without fixing it', area: 'feelings', difficulty: 'trivial' },
  { id: 'feel-kind-line', title: 'Say one kind thing to yourself and mean it', area: 'feelings', difficulty: 'easy' },
  { id: 'feel-music', title: 'Play a song you love all the way through', area: 'feelings', difficulty: 'trivial' },
  { id: 'feel-cry-or-laugh', title: 'Let yourself laugh or cry at something', area: 'feelings', difficulty: 'easy' },
  { id: 'feel-grateful', title: 'Thank someone, out loud or in writing', area: 'feelings', difficulty: 'easy' },
  { id: 'feel-rest-guilt', title: 'Rest without calling it lazy', area: 'feelings', difficulty: 'medium' },
  { id: 'feel-no', title: 'Say no to one thing you did not want', area: 'feelings', difficulty: 'medium' },
  { id: 'feel-ask', title: 'Ask for something you need', area: 'feelings', difficulty: 'medium' },

  // -- People --------------------------------------------------------------
  { id: 'people-text', title: 'Text someone you like', area: 'people', difficulty: 'trivial' },
  { id: 'people-check-in', title: 'Ask someone how they actually are', area: 'people', difficulty: 'easy' },
  { id: 'people-listen', title: 'Listen to someone without planning your reply', area: 'people', difficulty: 'easy' },
  { id: 'people-call', title: 'Call someone instead of typing', area: 'people', difficulty: 'medium' },
  { id: 'people-plan', title: 'Make a plan with someone for a real day', area: 'people', difficulty: 'medium' },
  { id: 'people-thanks', title: 'Tell your partner one thing you noticed', area: 'people', difficulty: 'trivial' },
  { id: 'people-apologise', title: 'Clear up something small before it sets', area: 'people', difficulty: 'medium' },
  { id: 'people-old-friend', title: 'Message someone you have not in a while', area: 'people', difficulty: 'easy' },
  { id: 'people-meal', title: 'Eat a meal with someone, no screens', area: 'people', difficulty: 'easy' },
  { id: 'people-help', title: 'Do one small thing for somebody else', area: 'people', difficulty: 'easy' },

  // -- Space ---------------------------------------------------------------
  { id: 'space-tidy-one', title: 'Tidy one small thing', area: 'space', difficulty: 'easy' },
  { id: 'space-outside', title: 'Step outside for a minute', area: 'space', difficulty: 'trivial' },
  { id: 'space-window', title: 'Open a window for some air', area: 'space', difficulty: 'trivial' },
  { id: 'space-dish', title: 'Wash one dish before it becomes a pile', area: 'space', difficulty: 'easy' },
  { id: 'space-plant', title: 'Water something that is alive', area: 'space', difficulty: 'trivial' },
  { id: 'space-surface', title: 'Clear one surface completely', area: 'space', difficulty: 'easy' },
  { id: 'space-bed', title: 'Make the bed', area: 'space', difficulty: 'trivial' },
  { id: 'space-laundry', title: 'Move the laundry one step along', area: 'space', difficulty: 'easy' },
  { id: 'space-bin', title: 'Throw out five things you do not want', area: 'space', difficulty: 'easy' },
  { id: 'space-light', title: 'Get some daylight on your face', area: 'space', difficulty: 'trivial' },

  // -- Purpose -------------------------------------------------------------
  { id: 'purpose-looking-forward', title: 'Say one thing you are looking forward to', area: 'purpose', difficulty: 'trivial' },
  { id: 'purpose-finish', title: 'Finish something you already started', area: 'purpose', difficulty: 'medium' },
  { id: 'purpose-fifteen', title: 'Spend fifteen minutes on the thing that matters', area: 'purpose', difficulty: 'easy' },
  { id: 'purpose-make', title: 'Make something, badly is fine', area: 'purpose', difficulty: 'easy' },
  { id: 'purpose-tomorrow', title: 'Write down the one thing tomorrow is for', area: 'purpose', difficulty: 'trivial' },
  { id: 'purpose-money', title: 'Look at your money without flinching', area: 'purpose', difficulty: 'medium' },
  { id: 'purpose-admin', title: 'Do the small admin thing you keep moving', area: 'purpose', difficulty: 'medium' },
  { id: 'purpose-practice', title: 'Practise the thing you want to be good at', area: 'purpose', difficulty: 'easy' },
  { id: 'purpose-why', title: 'Remind yourself why you started', area: 'purpose', difficulty: 'trivial' },
  { id: 'purpose-future', title: 'Do one thing your future self will thank you for', area: 'purpose', difficulty: 'easy' },
];

const BY_ID = new Map(SUGGESTIONS.map((s) => [s.id, s]));

export function suggestionById(id: string): Suggestion | undefined {
  return BY_ID.get(id);
}

/** Everything filed under one area, in catalogue order. */
export function suggestionsFor(area: AreaId): Suggestion[] {
  return SUGGESTIONS.filter((s) => s.area === area);
}

/**
 * What to offer somebody, given the areas they said they cared about and the
 * goals they already have.
 *
 * Two rules, and they are the whole of it. Never offer what they already took —
 * a list of ideas whose top entry is the thing you did this morning reads as
 * not paying attention. And round-robin the areas rather than concatenating
 * them, so picking three areas gives one of each before a second of any; a
 * concatenated list buries the last-chosen area below twenty entries nobody
 * scrolls to.
 *
 * Deliberately not random. Both phones derive this from the same synced tasks,
 * and a shuffled list would mean the ideas screen looked different on each
 * without either being more right.
 */
export function tailoredFor(areas: AreaId[], owned: Task[]): Suggestion[] {
  const taken = new Set(
    owned.filter((t) => !t.archivedAt && t.suggestionId).map((t) => t.suggestionId as string),
  );
  // An empty choice means "no preference", which is every area rather than
  // none — an ideas screen with nothing on it is worse than an unsorted one.
  const wanted = areas.length ? AREA_IDS.filter((a) => areas.includes(a)) : AREA_IDS;
  const queues = wanted.map((area) => suggestionsFor(area).filter((s) => !taken.has(s.id)));

  const out: Suggestion[] = [];
  for (let round = 0; queues.some((q) => round < q.length); round += 1) {
    for (const queue of queues) if (round < queue.length) out.push(queue[round]);
  }
  return out;
}

/** How many of an area's goals are done for the day, for the ring on the grid. */
export function areaProgress(goals: Task[], area: AreaId, day: string): { done: number; total: number } {
  const mine = goals.filter((t) => !t.archivedAt && t.area === area);
  return { done: mine.filter((t) => t.lastCompletedOn === day).length, total: mine.length };
}
