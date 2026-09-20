import { useLiveQuery } from 'dexie-react-hooks';
import { workoutDays } from '../../db/repository';
import { weekOf } from '../../domain/day';
import type { DayKey } from '../../domain/types';

/**
 * The week, as seven bubbles you can reach with a thumb.
 *
 * ## What it replaced
 *
 * Two arrows and a label. `‹ Saturday 29 August ›` told you where you were and
 * nothing else — not whether you trained on Tuesday, not how this week has
 * gone, and getting to Monday from Saturday was five taps with no way to see
 * that any of them were worth making. A workout log whose whole subject is
 * consistency showed one day at a time.
 *
 * ## Monday first, not Sunday
 *
 * `domain/day.ts`'s `weekOf` decides that, and the reasoning is there: the app
 * now has one definition of a week, shared with anything that counts one. The
 * two month grids head their columns with Sunday, which is a different question
 * — a month grid is a calendar page, and this is a window something is counted
 * inside.
 *
 * ## The bubbles are a radio group
 *
 * Exactly one day is selected and picking another deselects the first, which is
 * what a radio group is, so the group carries the role and each bubble is a
 * `radio` rather than seven independent buttons a screen reader would read as
 * unrelated.
 *
 * These are raw buttons rather than `Chip`, which is the one place in this
 * feature that does not use the button library. `Chip` is a label you toggle;
 * a day bubble carries three independent states — selected, today, trained —
 * and drives all three off data attributes so the stylesheet can paint them
 * without a class permutation per combination. That is already the house
 * pattern for a day cell: `WorkPage` and `CyclePage` both render
 * `button.cal-day` with exactly this shape. Bending `Chip` to pass arbitrary
 * data attributes through for one caller would make the shared primitive worse
 * to keep this file consistent.
 *
 * Days after today are genuinely disabled rather than hidden. A week with
 * Thursday missing is a week whose shape you cannot see, and a disabled control
 * is honest where one that silently does nothing when tapped is not.
 */

/** Monday first, matching `weekOf`. */
const INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export interface WeekThreadProps {
  memberId: string | null;
  /** The day the page is showing. Decides which week is drawn. */
  day: DayKey;
  today: DayKey;
  onPick: (day: DayKey) => void;
}

export function WeekThread({ memberId, day, today, onPick }: WeekThreadProps) {
  const week = weekOf(day);

  // Own week only. What the partner did belongs on the photo wall and the
  // calendar, where it is labelled as theirs; a dot on your own week strip that
  // turned out to be their workout is a week strip that lies about you.
  const logged = useLiveQuery(
    async () => (memberId ? workoutDays(week[0]!, week[6]!, memberId) : []),
    [memberId, week[0], week[6]],
  );
  const done = new Set(logged ?? []);

  return (
    <div className="week-thread" role="radiogroup" aria-label="Which day">
      {week.map((each, i) => {
        const ahead = each > today;
        return (
          <button
            key={each}
            type="button"
            role="radio"
            className="week-day"
            aria-checked={each === day}
            aria-label={label(each, i, done.has(each), ahead)}
            disabled={ahead}
            data-on={each === day ? 'true' : undefined}
            data-today={each === today ? 'true' : undefined}
            data-done={done.has(each) ? 'true' : undefined}
            onClick={() => onPick(each)}
          >
            <span className="week-day-initial" aria-hidden="true">{INITIALS[i]}</span>
            <span className="week-day-num" aria-hidden="true">{Number(each.slice(8, 10))}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * What a screen reader hears, which is not what the bubble shows.
 *
 * The bubble is two characters and a dot. Read aloud that is "M 14", which
 * says neither which month nor whether anything is there — so the label is a
 * sentence and the glyphs are `aria-hidden`.
 */
function label(day: DayKey, index: number, done: boolean, ahead: boolean): string {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const when = `${names[index]} ${Number(day.slice(8, 10))}`;
  if (ahead) return `${when}, still to come`;
  return done ? `${when}, trained` : `${when}, nothing logged`;
}
