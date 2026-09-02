import type { ExerciseSet } from '../../domain/types';

/**
 * The grid log, as arithmetic rather than as inputs.
 *
 * A row on screen holds strings, because that is what a text input holds and
 * because a half-typed number is a legitimate state to be in. A stored set
 * holds numbers. This file is the seam between the two, and it is where the
 * rules live: what counts as a row worth keeping, what a blank weight means,
 * and what the day adds up to.
 */

export interface SetRow {
  id: string;
  name: string;
  reps: string;
  weight: string;
}

/** A long name wraps forever in a 390px column; a caption is a line, not a diary. */
export const NAME_MAX = 40;
export const CAPTION_MAX = 140;

/** Nobody does a thousand reps, and a typo that says they did skews every total. */
export const REPS_MAX = 999;
export const WEIGHT_MAX = 999;

function rowId(): string {
  return crypto.randomUUID();
}

export function blankRow(id: string = rowId()): SetRow {
  return { id, name: '', reps: '', weight: '' };
}

/**
 * A number typed by a thumb: blank, partial and mistyped are all normal, and
 * all of them mean "nothing yet" rather than an error worth interrupting for.
 */
export function parseNumber(text: string, max: number): number | undefined {
  const value = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(max, Math.round(value * 100) / 100);
}

/** A row is worth keeping once it names an exercise. Reps can follow. */
export function rowHasContent(row: SetRow): boolean {
  return row.name.trim().length > 0;
}

/**
 * Rows to sets. Rows with no exercise name are dropped rather than stored as
 * blanks — an unnamed set tells you nothing tomorrow — and a missing weight
 * stays missing rather than becoming a zero, because bodyweight work is not
 * zero kilograms of work.
 */
export function toSets(rows: SetRow[]): ExerciseSet[] {
  const sets: ExerciseSet[] = [];
  for (const row of rows) {
    if (!rowHasContent(row)) continue;
    const weightKg = parseNumber(row.weight, WEIGHT_MAX);
    const set: ExerciseSet = {
      name: row.name.trim().slice(0, NAME_MAX),
      reps: parseNumber(row.reps, REPS_MAX) ?? 0,
    };
    if (weightKg !== undefined) set.weightKg = weightKg;
    sets.push(set);
  }
  return sets;
}

/** Sets back to rows, so reopening the day reopens the grid you left. */
export function toRows(sets: ExerciseSet[] | undefined, ids?: string[]): SetRow[] {
  return (sets ?? []).map((set, index) => ({
    id: ids?.[index] ?? rowId(),
    name: set.name,
    reps: set.reps > 0 ? String(set.reps) : '',
    weight: set.weightKg === undefined ? '' : String(set.weightKg),
  }));
}

/**
 * Volume: reps times weight, summed. Bodyweight sets contribute nothing to it,
 * which is why the screen shows reps alongside rather than instead — a day of
 * pull-ups is not an empty day.
 */
export function volumeOf(sets: ExerciseSet[]): number {
  return sets.reduce((total, set) => total + set.reps * (set.weightKg ?? 0), 0);
}

export function repsOf(sets: ExerciseSet[]): number {
  return sets.reduce((total, set) => total + set.reps, 0);
}

/** "12,400 kg" — grouped, because five digits of volume is unreadable otherwise. */
export function formatVolume(kg: number): string {
  return `${Math.round(kg).toLocaleString('en-US')} kg`;
}

/**
 * The one line under the grid. Plural-aware, and quiet when there is nothing
 * yet: an empty day should read as an empty day, not as a scoreboard of zeroes.
 */
export function summarise(sets: ExerciseSet[]): string {
  if (sets.length === 0) return 'Nothing logged yet.';
  const reps = repsOf(sets);
  const parts = [`${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`];
  if (reps > 0) parts.push(`${reps} ${reps === 1 ? 'rep' : 'reps'}`);
  const volume = volumeOf(sets);
  if (volume > 0) parts.push(formatVolume(volume));
  return parts.join(' · ');
}

/** A caption is trimmed and capped; an empty one is absent, not an empty string. */
export function cleanCaption(text: string): string | undefined {
  const trimmed = text.trim().slice(0, CAPTION_MAX);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Whether there is anything to save. Saving an empty day would write a row that
 * says a workout happened, which is the one thing it must not say.
 */
export function isWorthSaving(rows: SetRow[], caption: string): boolean {
  return rows.some(rowHasContent) || cleanCaption(caption) !== undefined;
}
