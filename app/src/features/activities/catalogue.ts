import type { IconName } from '../../nav';

/**
 * What is on the Activities hub.
 *
 * Data rather than JSX for the same reason `nav.ts` is: the hub renders this,
 * `App.tsx` declares routes, and `activities.test.ts` checks the two agree —
 * so a tile cannot point at a route that does not exist, and a route cannot be
 * added without a way to reach it.
 *
 * Goal Ideas is here and also in the menu, which is the one deliberate
 * duplicate: it belongs to Goals by ownership and to Activities by the kind of
 * thing it is, and Finch lists it in both places for the same reason.
 */
export interface Activity {
  to: string;
  name: string;
  hint: string;
  icon: IconName;
  /** True for the ones that write nothing at all and work unpaired. */
  openWhileUnpaired?: true;
}

export const ACTIVITIES: readonly Activity[] = [
  {
    to: '/goals/ideas',
    name: 'Goal ideas',
    hint: 'Small things to try, tailored to you',
    icon: 'target',
  },
  {
    to: '/activities/reflections',
    name: 'Reflections',
    hint: 'A question a day, somewhere private',
    icon: 'pen',
  },
  {
    to: '/activities/breathe',
    name: 'Breathing',
    hint: 'Four patterns, counted for you',
    icon: 'wind',
  },
  {
    to: '/activities/soundscapes',
    name: 'Soundscapes',
    hint: 'Rain, waves, a room. Made on the phone',
    icon: 'sound',
  },
  {
    to: '/activities/movements',
    name: 'Movements',
    hint: 'Short sets, no equipment, no floor needed',
    icon: 'dumbbell',
  },
  {
    to: '/activities/quizzes',
    name: 'Quizzes',
    hint: 'A few questions that end up in your journal',
    icon: 'checklist',
  },
  {
    to: '/activities/timer',
    name: 'Timers',
    hint: 'For a rest, a task, or a pot of something',
    icon: 'timer',
  },
  {
    to: '/activities/kindness',
    name: 'Act of kindness',
    hint: 'One small thing, for them or anyone',
    icon: 'gift',
  },
  {
    to: '/activities/support',
    name: 'Might help',
    hint: 'Suggestions for whoever is having the week',
    icon: 'heart',
  },
  {
    to: '/activities/first-aid',
    name: 'First aid',
    hint: 'For a bad hour. Stores nothing',
    icon: 'heart',
    openWhileUnpaired: true,
  },
];
