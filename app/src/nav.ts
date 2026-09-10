/**
 * The nav rail: what is on it, and what stays reachable without a partner.
 *
 * There used to be two navigation surfaces — a six-wide tab bar and a
 * six-door ring on the home screen — kept in step by hand and a test that
 * checked they agreed. They agreed on four of six. This is the one surface
 * that replaced both: every destination the app has, always on screen, so
 * there is nothing left to keep in step.
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
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface Tab {
  /** Router path, exactly as `App.tsx` declares it. */
  to: string;
  label: string;
  icon: IconName;
}

/**
 * Every destination the app has. Eight, which was the ceiling neither of the
 * old two surfaces could reach on its own: the tab bar stopped at six because
 * a phone's width ran out, and the ring stopped at six because a seventh
 * bubble started crowding the mascot. A vertical rail has neither problem —
 * length costs height, and a phone has more of that than it has width.
 *
 * Cycle is not here and never was: it can be locked, and a page that can be
 * locked should not announce itself alongside every other screen. It is a
 * section of Mood rather than a route of its own.
 */
export const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: 'house' },
  { to: '/tasks', label: 'Tasks', icon: 'checklist' },
  { to: '/mood', label: 'Mood', icon: 'mood' },
  { to: '/exercise', label: 'Move', icon: 'dumbbell' },
  { to: '/work', label: 'Work', icon: 'calendar' },
  { to: '/study', label: 'Study', icon: 'cards' },
  { to: '/party', label: 'Party', icon: 'sword' },
  { to: '/settings', label: 'You', icon: 'person' },
];

/**
 * What stays open on a phone with no partner yet.
 *
 * Settings, because it holds the pairing form itself — a gate that locked the
 * only way through it would be a wall. It also holds the theme picker, which is
 * the reason not to narrow this to a pairing-only screen: the first screen
 * anyone sees should be one they chose, and choosing costs nothing and writes
 * nothing that would have to be re-keyed later.
 */
export const OPEN_WHILE_UNPAIRED = ['/settings'];
