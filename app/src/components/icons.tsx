import type { IconName } from '../nav';

/**
 * The app's icons.
 *
 * There was no icon system before this: the tab bar and the home ring each
 * carried their own hand-maintained array of Unicode geometric shapes — `▲` for
 * workouts, `▦` for the calendar, `◑` for mood. They were chosen as a set that
 * looked coherent together, which they did, and that is the whole problem: a
 * triangle is coherent with a crosshatched square and neither of them is a
 * workout or a week.
 *
 * Drawn rather than imported. The five mascots in features/pet/mascots are the
 * precedent and the constraint: flat shapes, no gradients, everything painted
 * in `currentColor` so an icon inherits whatever the theme and the state around
 * it already decided. That is what lets the same file serve a tab (muted, then
 * accent when selected), a home bubble (accent), and a tile (accent) without
 * any of them passing a colour.
 *
 * One 24×24 grid, one 1.7 stroke, round caps and joins throughout. Sized in
 * `em` so it takes the font-size the surrounding rule already sets — the tab
 * bar asks for `var(--text-lg)` and gets it without knowing this file exists.
 */

/**
 * Every icon, keyed by name.
 *
 * `Record<IconName, ...>` is deliberate: it makes `tsc` refuse a name with no
 * drawing and a drawing with no name, which is a better guarantee than a test
 * because it cannot be forgotten at the moment someone adds the seventh tab.
 */
const PATHS: Record<IconName, JSX.Element> = {
  // A roof and a door. The dashboard, which is where the pet lives.
  house: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.6V20h13V9.6" />
      <path d="M9.8 20v-5.4h4.4V20" />
    </>
  ),

  // A list with two of its lines struck through. Tasks.
  checklist: (
    <>
      <path d="M4 6.6l1.7 1.7L9 5" />
      <path d="M4 13.1l1.7 1.7L9 11.5" />
      <path d="M4 19.6l1.7 1.7L9 18" />
      <path d="M12.5 7h7.5M12.5 13.5h7.5M12.5 20h7.5" />
    </>
  ),

  // A face, because the page asks how the day felt. The mouth is a gentle
  // curve rather than a grin: the page logs a range, not a verdict.
  mood: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.6 15c.9.9 2.1 1.4 3.4 1.4s2.5-.5 3.4-1.4" />
      <path d="M9.2 9.6v.9M14.8 9.6v.9" />
    </>
  ),

  // A dumbbell. The one this replaces was a triangle.
  dumbbell: (
    <>
      <path d="M9 12h6" />
      <path d="M6.4 8.7v6.6M17.6 8.7v6.6" />
      <path d="M3.8 10.3v3.4M20.2 10.3v3.4" />
    </>
  ),

  // A month, with its header rule and its hanging rings. Work.
  calendar: (
    <>
      <rect x="3.5" y="5.2" width="17" height="15.3" rx="2.2" />
      <path d="M3.5 10h17" />
      <path d="M8.2 3.5v3.2M15.8 3.5v3.2" />
      <path d="M7.8 13.6h2M11 13.6h2M14.2 13.6h2M7.8 16.9h2M11 16.9h2" />
    </>
  ),

  // Head and shoulders. The tab is labelled "You", so it is a person and not
  // a cog: the page behind it is mostly the two of you, and only then settings.
  person: (
    <>
      <circle cx="12" cy="8.4" r="3.9" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),

  // Two cards, one behind the other. Study.
  cards: (
    <>
      <rect x="8.2" y="6.4" width="12.3" height="14.1" rx="2" />
      <path d="M5.4 17.4A2 2 0 0 1 4 15.5V5.5a2 2 0 0 1 2-2h7.4" />
      <path d="M11.4 11.4h5.9M11.4 15h3.6" />
    </>
  ),

  // A sword. The party page is the boss you are fighting.
  sword: (
    <>
      <path d="M20.3 3.7 11 13v3.4h-3.4L3.7 20.3" />
      <path d="M20.3 3.7v4.6L16.4 12" />
      <path d="M20.3 3.7h-4.6L12 7.6" />
      <path d="M6.6 14.2 9.8 17.4" />
    </>
  ),

  // A crescent. The cycle half of the mood page, where it labels the section
  // rather than a route.
  moon: <path d="M20 14.3A8.6 8.6 0 0 1 9.7 4a8.6 8.6 0 1 0 10.3 10.3z" />,

  // Three lines. The one control that is a control rather than a place, so it
  // is the one drawing here that is deliberately not a picture of anything.
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),

  // A four-pointed star with a smaller one beside it. Quests are the extra on
  // top of the day, which is what a sparkle is for.
  sparkle: (
    <>
      <path d="M10 3.6 11.7 8 16 9.7 11.7 11.4 10 15.8 8.3 11.4 4 9.7 8.3 8z" />
      <path d="M17.2 14.4 18.1 16.7 20.4 17.6 18.1 18.5 17.2 20.8 16.3 18.5 14 17.6 16.3 16.7z" />
    </>
  ),

  // A tote with two handles. Where coins go out.
  shop: (
    <>
      <path d="M4.6 8.4h14.8l-1.1 11a1.4 1.4 0 0 1-1.4 1.2H7.1a1.4 1.4 0 0 1-1.4-1.2z" />
      <path d="M9 10.6V7a3 3 0 0 1 6 0v3.6" />
    </>
  ),

  // Two birds side by side, one smaller. Two people, which is the whole app.
  friends: (
    <>
      <path d="M10.6 8.2a3.1 3.1 0 1 1-6.2 0 3.1 3.1 0 0 1 6.2 0z" />
      <path d="M2.9 20.1a4.6 4.6 0 0 1 9.2 0" />
      <path d="M15.8 5.4a3.1 3.1 0 0 1 0 5.6" />
      <path d="M17 15.9a4.6 4.6 0 0 1 4.1 4.2" />
    </>
  ),

  // A satchel with a flap. What you already own, as against what the shop has.
  bag: (
    <>
      <path d="M3.9 9.7h16.2v9.2a1.6 1.6 0 0 1-1.6 1.6H5.5a1.6 1.6 0 0 1-1.6-1.6z" />
      <path d="M3.9 9.7 6.6 4.2h10.8l2.7 5.5" />
      <path d="M9.4 13.1h5.2" />
    </>
  ),

  // A bird on a perch. The one this is all for.
  bird: (
    <>
      <path d="M8.6 4.3a3.7 3.7 0 0 1 3.7 3.7v3.3a6.3 6.3 0 0 1-6.3 6.3H5a7.5 7.5 0 0 0 3.6-6.4" />
      <path d="M12.3 8h4.4l3.1 3.1-3.1.9" />
      <path d="M7.1 6.6h.01" />
      <path d="M9.6 17.6v2.8" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  /** Overrides the inherited font-size. Anything CSS accepts as a length. */
  size?: string;
}

/**
 * One icon, sized off the surrounding font-size unless told otherwise.
 *
 * `aria-hidden` without exception: every place these are used already has a
 * visible text label beside the icon, so announcing it would read the same word
 * twice. If that ever stops being true, the caller labels the control, not this.
 */
export function Icon({ name, size = '1em' }: IconProps) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
