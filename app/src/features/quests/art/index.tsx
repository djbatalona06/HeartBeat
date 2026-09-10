import type { ComponentType } from 'react';
import type { QuestMeasure } from '../../../domain/quests/templates';
import type { TaskType } from '../../../domain/rpg/types';

/**
 * Drawings for quests and for the three kinds of task.
 *
 * The board and the task list were entirely typographic — a title, a number, a
 * bar — so every offer looked like every other offer and picking one was
 * reading rather than recognising. Six lines of prose is a lot to ask for a
 * choice somebody makes in two seconds once a week.
 *
 * **Keyed by measure, not by template.** There are eleven quest templates and
 * only seven things they count, and two quests that count the same thing
 * should look the same — that is the honest grouping, and it is the one the
 * engine already uses. A per-template icon set would be eleven drawings
 * asserting eleven distinctions that do not exist.
 *
 * One file rather than one file per drawing, which is where this deviates from
 * `features/party/art/gear`. That split exists because each gear drawing is a
 * distinct catalogue *item* with its own name and blurb; these are a small
 * closed set keyed by an enum, and ten six-line shapes read better together
 * than spread over ten files.
 *
 * `Record<QuestMeasure, …>` and `Record<TaskType, …>` are doing the work the
 * gear registry does with a runtime throw: `tsc` refuses a measure with no
 * drawing and a drawing with no measure, which cannot be forgotten at the
 * moment somebody adds the eighth measure.
 *
 * Drawn, not imported — the constraint everything visual in this app is under,
 * see NOTICE.md. One 24×24 grid, 1.8 stroke, round caps, everything in
 * `currentColor` so an icon takes whatever colour the rule around it already
 * decided.
 */

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="quest-icon"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** A face on a dial. Mood is the one measure that is a reading, not a count. */
const MoodDays = () => (
  <Glyph>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.6 14.2a4.4 4.4 0 0 0 6.8 0" />
    <path d="M9.3 9.6h.01M14.7 9.6h.01" />
  </Glyph>
);

/** A dumbbell. The same shape the rail already uses for Move, on purpose. */
const ExerciseDays = () => (
  <Glyph>
    <path d="M3 10v4M6 8v8M18 8v8M21 10v4" />
    <path d="M6 12h12" />
  </Glyph>
);

/** A camera. Proof is the measure that needs a photograph, not just a log. */
const ProofDays = () => (
  <Glyph>
    <path d="M3.5 8.5h3.2l1.4-2h7.8l1.4 2h3.2v10H3.5z" />
    <circle cx="12" cy="13" r="3.2" />
  </Glyph>
);

/** A moon. Matches the cycle section's own mark elsewhere in the app. */
const CycleDays = () => (
  <Glyph>
    <path d="M20 14.3A8.6 8.6 0 0 1 9.7 4a8.6 8.6 0 1 0 10.3 10.3z" />
  </Glyph>
);

/** A week with something in it. Planning is the calendar measure. */
const PlanDays = () => (
  <Glyph>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    <path d="M8.5 14.5h3" />
  </Glyph>
);

/** A ticked list. */
const TasksFinished = () => (
  <Glyph>
    <path d="M4 7.5 5.6 9l2.6-2.8M4 16.5 5.6 18l2.6-2.8" />
    <path d="M12 8h8M12 17h8" />
  </Glyph>
);

/** A note left for the other one. */
const NoteDays = () => (
  <Glyph>
    <path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </Glyph>
);

const QUEST_ART: Record<QuestMeasure, ComponentType> = {
  moodDays: MoodDays,
  exerciseDays: ExerciseDays,
  proofDays: ProofDays,
  cycleDays: CycleDays,
  planDays: PlanDays,
  tasksFinished: TasksFinished,
  noteDays: NoteDays,
};

export function questArt(measure: QuestMeasure): ComponentType {
  return QUEST_ART[measure];
}

/**
 * A loop. A Habit is the one that never finishes and can be done again in the
 * same day — see `logHabitDown` — so it is drawn as the thing with no end.
 */
const Habit = () => (
  <Glyph>
    <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9.4" />
    <path d="M20 4.6v4.8h-4.8" />
    <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 14.6" />
    <path d="M4 19.4v-4.8h4.8" />
  </Glyph>
);

/** A sun. A Daily comes back tomorrow whether or not today went well. */
const Daily = () => (
  <Glyph>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2" />
    <path d="M5.4 5.4 7 7M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
  </Glyph>
);

/** A box with a tick. A To-Do is done once and then archived. */
const Todo = () => (
  <Glyph>
    <path d="M20 11.2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    <path d="M8.5 11.5 11.5 14.5 21 5" />
  </Glyph>
);

const TASK_ART: Record<TaskType, ComponentType> = {
  habit: Habit,
  daily: Daily,
  todo: Todo,
};

export function taskArt(type: TaskType): ComponentType {
  return TASK_ART[type];
}
