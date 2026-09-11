/**
 * Where the app can go, and which surface shows it.
 *
 * There used to be two navigation surfaces — a six-wide tab bar and a
 * six-door ring on the home screen — kept in step by hand and a test that
 * checked they agreed. They agreed on four of six. A vertical rail replaced
 * both, on the reasoning that a rail has no width limit so every destination
 * could sit on one surface and nothing would need keeping in step.
 *
 * That held for the eight destinations there were. It does not hold now: this
 * app has fourteen places to be, and a rail of fourteen icons is a list, not a
 * bar. So the shape is Finch's — six tabs across the bottom, everything else
 * one tap away behind the menu button — and the lesson from the first split is
 * kept instead by making one registry the source for all of it. `PRIMARY_TABS`
 * and `MENU_GROUPS` partition `ALL_DESTINATIONS`; `nav.test.ts` proves the
 * partition, so a destination cannot be in both places or in neither.
 *
 * `CommandMenu` maps over `ALL_DESTINATIONS` for the same reason. It used to
 * hold its own hand-written copy of this list, and by the time it was replaced
 * that copy had already drifted: it had no entry for Study, so the one screen
 * you would most want to jump straight to was the one ⌘K could not find.
 */

/**
 * Every icon `components/icons.tsx` draws.
 *
 * Named rather than drawn as characters. The bar used to carry Unicode
 * geometry — `▲` for the workout tab, `▦` for the calendar — chosen to look
 * coherent as a set, which they did; a triangle is simply not a workout.
 */
export const ICON_NAMES = [
  'house',
  'checklist',
  'mood',
  'dumbbell',
  'calendar',
  'person',
  'cards',
  'sword',
  'moon',
  'menu',
  'sparkle',
  'shop',
  'friends',
  'bag',
  'bird',
  'target',
  'leaf',
  'wind',
  'heart',
  'pen',
  'sound',
  'timer',
  'gift',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface Tab {
  /** Router path, exactly as `App.tsx` declares it. */
  to: string;
  label: string;
  icon: IconName;
  /** One line, shown under the label in the menu grid and in ⌘K. */
  hint: string;
}

export interface MenuGroup {
  title: string;
  tabs: Tab[];
}

/**
 * The six across the bottom.
 *
 * Six because that is what a phone's width fits at a real tap target, and
 * because these six are the ones a self-care app is opened for: what today
 * wants, what it pays, what that buys, who else is here, what you own, and the
 * bird it is all for. Everything else is a place you go on purpose, which is
 * what the menu is.
 *
 * Friends is the partner, not a network. This app is for two people, so Tree
 * Town has one other house in it — that is a smaller feature than Finch's and
 * an honest one, rather than a social graph with nobody in it.
 */
export const PRIMARY_TABS: Tab[] = [
  { to: '/', label: 'Home', icon: 'house', hint: 'Your birb, and what today still wants' },
  { to: '/quests', label: 'Quests', icon: 'sparkle', hint: 'Extra ways to earn, and the shelf' },
  { to: '/shop', label: 'Shop', icon: 'shop', hint: 'Gear, eggs, and what coins are for' },
  { to: '/friends', label: 'Friends', icon: 'friends', hint: 'Their birb, and something kind to send' },
  { to: '/bag', label: 'Bag', icon: 'bag', hint: 'What you own and what you are wearing' },
  { to: '/birb', label: 'Birb', icon: 'bird', hint: 'Companions, adventures, and the boss' },
];

/**
 * Everything else, as a grid behind the menu button.
 *
 * Grouped rather than listed: fourteen tiles in one block is the same problem
 * as fourteen icons in a rail, and these do fall into two honest halves — the
 * log you keep, and the app itself.
 */
export const MENU_GROUPS: MenuGroup[] = [
  {
    title: 'Your day',
    tabs: [
      { to: '/tasks', label: 'Tasks', icon: 'checklist', hint: 'Dailies, habits and to-dos' },
      { to: '/mood', label: 'Mood', icon: 'mood', hint: 'Three meters, the cycle log, something sweet' },
      { to: '/exercise', label: 'Move', icon: 'dumbbell', hint: 'Workouts and proof' },
      { to: '/work', label: 'Work', icon: 'calendar', hint: 'The shared calendar' },
      { to: '/study', label: 'Study', icon: 'cards', hint: 'Flashcards, due today' },
    ],
  },
  {
    title: 'Self-care',
    tabs: [
      { to: '/goals', label: 'Goals', icon: 'target', hint: 'What you are keeping up, by area' },
      { to: '/goals/ideas', label: 'Goal ideas', icon: 'sparkle', hint: 'Small things to try, tailored to you' },
      { to: '/areas', label: 'Areas', icon: 'leaf', hint: 'The six parts, and which are quiet' },
      { to: '/activities', label: 'Activities', icon: 'wind', hint: 'Breathing, journal, sounds, movement, first aid' },
    ],
  },
  {
    title: 'The app',
    tabs: [
      { to: '/party', label: 'Party', icon: 'sword', hint: 'Everything about the two of you at once' },
      { to: '/settings', label: 'You', icon: 'person', hint: 'Pairing, theme, notifications' },
    ],
  },
];

/**
 * Both surfaces at once, in the order you would read them.
 *
 * This is what `CommandMenu` searches, so a destination that reaches either
 * surface is findable by name without anyone remembering to add it twice.
 */
export const ALL_DESTINATIONS: Tab[] = [
  ...PRIMARY_TABS,
  ...MENU_GROUPS.flatMap((group) => group.tabs),
];

/**
 * Names that are not destinations of their own but are what somebody types.
 *
 * The cycle log became the last section of Mood. It kept its route as a
 * redirect because it is in notification deep links and quite possibly on
 * somebody's home screen; it keeps its name here for the same reason, because
 * "cycle" is the word, and a search that answers "nothing goes by that name"
 * to the right word is worse than no search.
 */
export const ALIASES: Tab[] = [
  { to: '/mood', label: 'Cycle', icon: 'moon', hint: 'The log, at the foot of Mood' },
];

/**
 * What stays open on a phone with no partner yet.
 *
 * Settings, because it holds the pairing form itself — a gate that locked the
 * only way through it would be a wall. It also holds the theme picker, which is
 * the reason not to narrow this to a pairing-only screen: the first screen
 * anyone sees should be one they chose, and choosing costs nothing and writes
 * nothing that would have to be re-keyed later.
 *
 * Welcome and Onboarding are open for the same reason, earlier: they run
 * before pairing is even the question, via `FirstRunGate` — see
 * `features/onboarding/`.
 */
export const OPEN_WHILE_UNPAIRED = [
  '/settings',
  '/welcome',
  '/onboarding',
  // A page meant for somebody's worst hour cannot sit behind a pairing gate.
  // It writes nothing and reads nothing, so there is no couple for it to need.
  '/activities/first-aid',
];
