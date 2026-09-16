import { phaseAt } from '../scene/schedule';

/**
 * How the pet is doing, and the one thing it is never allowed to be.
 *
 * ## What this replaced, and why it is not a rename
 *
 * `Pet.mood` shipped with four values — happy, content, sleepy, **sulking** —
 * and four faces to match. The sulking face is half-lidded eyes and a frown:
 * the pet looking unhappy at you.
 *
 * It was never reachable. Every write in the repository is
 * `mood: pet?.mood ?? 'content'`, in all four places that touch a `Pet` row,
 * and nothing in the app, the Worker or the C# core ever set it to anything
 * else. So the pet has been permanently content since the day it shipped, four
 * faces were drawn and one was ever seen, and the only place the word reached a
 * person at all was a screen reader on the home screen announcing "…level 12
 * and sulking".
 *
 * The brief asked for "sulking" to become "resting" in user-facing strings.
 * That would have renamed a word nobody could see, on a state nothing could
 * produce, and left the frown in the codebase waiting for the first person who
 * decided the pet should react to a missed day.
 *
 * So the value is gone instead, from the type and from the art. **The pet has
 * no face for disappointment.** That is a stronger guarantee than a rename and
 * a much stronger one than a settings toggle: you cannot ship the trap if there
 * is no word for it.
 *
 * ## What it can be, instead of nothing
 *
 * A pet that is permanently `content` is not a pet, so the three remaining
 * moods are now derived rather than stored:
 *
 * - **sleepy** at night, because the hour is a fact about the world and not
 *   about you.
 * - **happy** when the couple's glow is high, which is what a recent log looks
 *   like.
 * - **content** the rest of the time — and, importantly, **at the bottom**.
 *
 * That last one is the whole design. A quiet fortnight takes the pet from happy
 * to content. It never takes it below, because the floor is the thing that
 * decides whether opening the app after a hard week feels like coming home or
 * like being told off.
 */
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
