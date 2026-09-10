/**
 * The bottom bar: what is on it, and what stays reachable without a partner.
 *
 * Pulled out of `App.tsx` for the reason `features/dashboard/layout.ts` was
 * pulled out of `DashboardPage.tsx` — it is data, the tests only run `.ts`, and
 * the two navigation surfaces had already drifted into two hand-maintained
 * copies of the same six destinations. Keeping both here means a route can be
 * renamed once.
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
 * Six, and six is the ceiling on a phone.
 *
 * Cycle is not here and never was: it can be locked, and a page that can be
 * locked should not announce itself along the bottom of every other screen.
 * It is now a section of Mood rather than a route of its own, which is what
 * finally makes that true instead of merely arranged for.
 */
export const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: 'house' },
  { to: '/tasks', label: 'Tasks', icon: 'checklist' },
  { to: '/mood', label: 'Mood', icon: 'mood' },
  { to: '/exercise', label: 'Move', icon: 'dumbbell' },
  { to: '/work', label: 'Work', icon: 'calendar' },
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
