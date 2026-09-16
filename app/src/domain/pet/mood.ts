import { phaseAt } from '../scene/schedule';

/** How the pet is drawn. Derived from the hour and the couple's glow. */
export type PetMood = 'happy' | 'content' | 'sleepy';

/** The floor, and the answer whenever there is nothing better to say. */
export const DEFAULT_MOOD: PetMood = 'content';

export interface MoodInput {
  /** Local hour, 0-23. */
  hour: number;
  /**
   * The couple's glow, 0-1, as `glowOf(vitals)` computes it.
   *
   * Clamped rather than trusted: it is a ratio over a floor and a full mark,
   * and a reading slightly outside the range should be a bright pet rather
   * than a crash.
   */
  glow: number;
}

/**
 * Bright enough to show it.
 *
 * Two thirds rather than a half: at a half the pet is happy more often than
 * not, which makes happy the resting state and drains it of meaning. It should
 * read as "something good happened recently", and it should be the couple's
 * own doing rather than the default.
 */
export const HAPPY_AT = 0.66;

export function moodFor({ hour, glow }: MoodInput): PetMood {
  // Night first. A pet that is wide awake and delighted at 3am is a pet that
  // does not live anywhere, and sleepiness is the one mood that is honestly
  // about the world rather than about how the couple has been doing.
  if (phaseAt(hour) === 'night') return 'sleepy';
  return Math.min(1, Math.max(0, glow)) >= HAPPY_AT ? 'happy' : DEFAULT_MOOD;
}

/**
 * Whatever is on a stored row, made safe to draw.
 *
 * Provably nothing ever wrote `'sulking'`, so in practice this only ever sees
 * `'content'`. It exists for the row that arrives from somewhere this version
 * cannot see — a partner's phone on an older build, a backup restored from
 * before this change — because the alternative is a mascot handed a mood it has
 * no art for. An unknown value resolves to the floor, never to a face that
 * frowns, since there is no longer one to resolve to.
 */
export function normalizeMood(value: unknown): PetMood {
  return value === 'happy' || value === 'sleepy' ? value : DEFAULT_MOOD;
}

/**
 * The mood in words, for the one place it is spoken aloud.
 *
 * The home screen's mascot carries an `aria-label`, so a screen reader is the
 * only way anyone has ever encountered these as language. They read as
 * descriptions of an animal, not as verdicts on a person: "having a nice day"
 * rather than "happy because you logged", and nothing that could be heard as a
 * report card.
 */
export function moodWords(mood: PetMood): string {
  switch (mood) {
    case 'happy': return 'having a lovely day';
    case 'sleepy': return 'dozing';
    default: return 'pottering about';
  }
}
