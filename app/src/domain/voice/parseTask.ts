import type { TaskDifficulty, TaskType } from '../rpg/types';

/**
 * "add a daily habit, drink water, easy" → a task draft.
 *
 * Deterministic rather than model-driven, and that is the point. An LLM asked
 * to turn a sentence into a task will occasionally invent one that was never
 * said, and a to-do list that quietly grows things you did not ask for is
 * worse than one you have to type into. This only ever removes words it
 * recognises; whatever is left becomes the title verbatim.
 *
 * Pure, so vitest reaches it — vitest.config.ts collects .ts only.
 */

export interface TaskIntent {
  title: string;
  type: TaskType;
  difficulty: TaskDifficulty;
}

/**
 * Openers people actually say to a microphone. Stripped from the front so
 * "add a task to call mum" becomes "call mum" rather than a task literally
 * named "add a task to call mum".
 */
const OPENERS = [
  'add a new task to',
  'add a new task',
  'add a task to',
  'add a task',
  'remind me to',
  'i need to',
  'i want to',
  'new task',
  'add',
];

/**
 * Ordered longest-first within each type so "every day" is matched before
 * "day" could be, and so a phrase never half-matches and leaves debris.
 */
const TYPE_CUES: [RegExp, TaskType][] = [
  [/\b(?:as|it'?s|make it)? ?a? ?daily habit\b/gi, 'daily'],
  [/\bevery ?day\b/gi, 'daily'],
  [/\beach day\b/gi, 'daily'],
  [/\bdaily\b/gi, 'daily'],
  [/\bhabit\b/gi, 'habit'],
  [/\bto ?-? ?do\b/gi, 'todo'],
  [/\bone ?-? ?off\b/gi, 'todo'],
];

const DIFFICULTY_CUES: [RegExp, TaskDifficulty][] = [
  [/\bvery hard\b/gi, 'hard'],
  [/\btrivial\b/gi, 'trivial'],
  [/\btiny\b/gi, 'trivial'],
  [/\beasy\b/gi, 'easy'],
  [/\bmedium\b/gi, 'medium'],
  [/\bhard\b/gi, 'hard'],
  [/\bdifficult\b/gi, 'difficult' as TaskDifficulty & 'difficult'],
];

/** Tidy what is left after the cues are cut out of the middle of a sentence. */
function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    // Cutting a cue can leave a dangling separator: "drink water, , easy".
    .replace(/\s*,\s*(?=,|$)/g, '')
    .replace(/^[\s,;.\-—]+|[\s,;.\-—]+$/g, '')
    // "a" and "the" left stranded at the front read as noise.
    .replace(/^(?:a|an|the)\s+/i, '')
    .trim();
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function parseTask(transcript: string): TaskIntent {
  let rest = ` ${transcript.trim()} `;

  // Openers first, longest first, anchored to the start so "add" inside a
  // title ("add sugar") survives.
  const head = rest.trimStart().toLowerCase();
  for (const opener of OPENERS) {
    if (head.startsWith(`${opener} `)) {
      rest = ` ${rest.trimStart().slice(opener.length)} `;
      break;
    }
  }

  let type: TaskType = 'todo';
  for (const [cue, value] of TYPE_CUES) {
    cue.lastIndex = 0;
    if (cue.test(rest)) {
      type = value;
      rest = rest.replace(cue, ' ');
      break;
    }
  }

  let difficulty: TaskDifficulty = 'easy';
  for (const [cue, value] of DIFFICULTY_CUES) {
    cue.lastIndex = 0;
    if (cue.test(rest)) {
      // "difficult" is a synonym, not a fifth difficulty.
      difficulty = value === ('difficult' as TaskDifficulty) ? 'hard' : value;
      rest = rest.replace(cue, ' ');
      break;
    }
  }

  const title = capitalise(tidy(rest));

  // A sentence made entirely of cues leaves nothing to name the task. Keeping
  // the raw transcript beats saving a task called "".
  return { title: title || transcript.trim(), type, difficulty };
}
