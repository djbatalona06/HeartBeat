import type { DayKey, MoodEntry } from '../../domain/types';

/**
 * The words the Mood screen says, and the arithmetic behind them.
 *
 * The screen itself is three sliders and six columns; almost nothing there can
 * be wrong. What can be wrong lives here. A 1-10 number means nothing on its
 * own — a 9 is a good day on the joy meter and a hard one on the moody meter —
 * so each meter carries its own ten words, and getting one of those off by one
 * would quietly tell someone they are "stormy" when they said they were fine.
 *
 * The other rule pinned here is the difference between a day nobody logged and
 * a day logged as middling. Every function below takes `null` for "not logged"
 * and says so in words rather than falling back to a neutral 5, because an app
 * that invents a mood for you is worse than one that admits it does not know.
 */

export type MoodKey = 'hunger' | 'joy' | 'moody';

export interface MoodValues {
  hunger: number;
  joy: number;
  moody: number;
}

export const MOOD_MIN = 1;
export const MOOD_MAX = 10;

/** Where a slider sits before it has been touched. Never written on its own. */
export const NEUTRAL_MOOD: MoodValues = { hunger: 5, joy: 5, moody: 5 };

/** Used until pairing gives the other column a real name to wear. */
export const PARTNER_FALLBACK_NAME = 'Your partner';

export interface MoodMeter {
  key: MoodKey;
  label: string;
  /** What the bottom and the top of the column mean, so direction is never a guess. */
  low: string;
  high: string;
  /** Ten words, one per point; index 0 is a value of 1. */
  scale: readonly string[];
}

/**
 * Read bottom to top, the way the columns fill. Two of these three read as
 * "more is worse" and one as "more is better", which is exactly why the words
 * are here and not derived from the number.
 */
export const MOOD_METERS: readonly MoodMeter[] = [
  {
    key: 'hunger',
    label: 'Hunger',
    low: 'full',
    high: 'ravenous',
    scale: [
      'Stuffed', 'Full', 'Satisfied', 'Comfortable', 'Could eat',
      'Peckish', 'Hungry', 'Properly hungry', 'Very hungry', 'Ravenous',
    ],
  },
  {
    key: 'joy',
    label: 'Joy',
    low: 'flat',
    high: 'radiant',
    scale: [
      'Flat', 'Low', 'Muted', 'Okay', 'Steady',
      'Warm', 'Good', 'Bright', 'Glowing', 'Radiant',
    ],
  },
  {
    key: 'moody',
    label: 'Moody',
    low: 'even',
    high: 'stormy',
    scale: [
      'Even', 'Settled', 'Mostly calm', 'A bit off', 'Unsettled',
      'Prickly', 'Irritable', 'Tetchy', 'Frayed', 'Stormy',
    ],
  },
];

/**
 * "Monday 31 August". The locale is named rather than left to the device: the
 * two phones should show the couple the same words for the same day.
 */
export function longDay(day: DayKey): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function meterFor(key: MoodKey): MoodMeter {
  const meter = MOOD_METERS.find((m) => m.key === key);
  if (!meter) throw new Error(`no such mood meter: ${key}`);
  return meter;
}

/**
 * A slider can only send 1-10; a row synced from another phone, or written by
 * an older build, can send anything. A missing number lands in the middle
 * rather than throwing, because a broken row should cost one wrong word on one
 * column, not the whole screen.
 */
export function clampMood(value: number): number {
  if (!Number.isFinite(value)) return NEUTRAL_MOOD.joy;
  return Math.min(MOOD_MAX, Math.max(MOOD_MIN, Math.round(value)));
}

export function scaleWord(key: MoodKey, value: number): string {
  return meterFor(key).scale[clampMood(value) - 1];
}

/** The three numbers out of a stored row, or null for a day nobody logged. */
export function valuesOf(entry: MoodEntry | null | undefined): MoodValues | null {
  if (!entry) return null;
  return {
    hunger: clampMood(entry.hunger),
    joy: clampMood(entry.joy),
    moody: clampMood(entry.moody),
  };
}

/** One person's day in two words: "bright, and settled". */
export function toneOf(values: MoodValues): string {
  return `${scaleWord('joy', values.joy).toLowerCase()}, and ${scaleWord('moody', values.moody).toLowerCase()}`;
}

export interface SummaryContext {
  partnerName?: string;
  /** False before pairing, when there is genuinely no second column to fill. */
  paired?: boolean;
}

/**
 * The lead sentence above the columns.
 *
 * Nothing here scolds an empty day. "Whenever you are ready" is the whole of
 * the nudge, and it is the same sentence on day one as on day two hundred.
 */
export function moodSummary(
  mine: MoodValues | null,
  theirs: MoodValues | null,
  context: SummaryContext = {},
): string {
  const name = context.partnerName?.trim() || PARTNER_FALLBACK_NAME;
  const paired = context.paired ?? Boolean(theirs);

  if (mine && theirs) return `You are ${toneOf(mine)}. ${name} is ${toneOf(theirs)}.`;
  if (mine) {
    return paired
      ? `You are ${toneOf(mine)}. ${name} has not logged today yet.`
      : `You are ${toneOf(mine)} today.`;
  }
  if (theirs) return `${name} is ${toneOf(theirs)}. Your side of today is still open.`;
  return paired
    ? 'Nothing logged today. Whenever either of you is ready.'
    : 'Nothing logged today. Whenever you are ready.';
}

export interface MoodGap {
  key: MoodKey;
  distance: number;
}

/**
 * The meter the two of you are furthest apart on. Ties resolve in the order
 * the meters are drawn, so the sentence under the columns never flickers
 * between two equally true readings of the same day.
 */
export function widestGap(mine: MoodValues | null, theirs: MoodValues | null): MoodGap | null {
  if (!mine || !theirs) return null;
  let widest: MoodGap = { key: MOOD_METERS[0].key, distance: -1 };
  for (const meter of MOOD_METERS) {
    const distance = Math.abs(mine[meter.key] - theirs[meter.key]);
    if (distance > widest.distance) widest = { key: meter.key, distance };
  }
  return widest;
}

/** The quieter second line. Null when there is only one column to read. */
export function comparisonLine(
  mine: MoodValues | null,
  theirs: MoodValues | null,
): string | null {
  const gap = widestGap(mine, theirs);
  if (!gap) return null;
  if (gap.distance <= 1) return 'Within a point of each other on all three today.';
  const label = meterFor(gap.key).label.toLowerCase();
  return `Furthest apart on ${label}, ${gap.distance} points between you.`;
}

/**
 * Whether there is anything to save.
 *
 * `draft` is null until a slider moves and `note` is null until the field is
 * typed in, so an untouched screen is never mistaken for an edit — which is
 * what keeps opening the page from overwriting a day with the defaults.
 */
export function moodChanged(
  entry: MoodEntry | null | undefined,
  draft: MoodValues | null,
  note: string | null,
): boolean {
  if (draft) {
    const stored = valuesOf(entry);
    if (!stored) return true;
    if (
      stored.hunger !== draft.hunger
      || stored.joy !== draft.joy
      || stored.moody !== draft.moody
    ) {
      return true;
    }
  }
  if (note !== null && note.trim() !== (entry?.note ?? '')) return true;
  return false;
}
