import type { Gender } from '../types';

/**
 * Which kinds of suggestion apply to this person, in this couple.
 *
 * This module exists so that no content table ever sees a gender. The profile
 * answer is turned into lanes exactly once, here, which means the whole of the
 * app's willingness to assume things about people is one short function a
 * reviewer can read in full and argue with. Everything downstream filters on a
 * lane and knows nothing about who is in the couple.
 *
 * The rule that does the real work: **the cycle lanes follow who tracks a
 * cycle, not who is which gender.** `tracksCycle` is a thing a person said
 * about themselves on this device; a gender is not a claim about whether
 * anyone has periods. Keying off the tracking flag gets the couples this app
 * is actually for right by the general rule rather than by a special case —
 * two women who both track both get `cycle-self` and `cycle-partner`; a woman
 * who does not track one is not handed cycle content she did not ask for; and
 * a trans or non-binary person gets whichever lanes match what they log.
 *
 * Gender selects exactly one lane, `mens-health`, and only because the
 * screenings in it are the ones men reliably skip. `unstated` is a real answer
 * that lands on `general` — not a lesser version of the feature, just the part
 * of it that is for everybody.
 */

export type SupportLane = 'cycle-self' | 'cycle-partner' | 'mens-health' | 'general';

export const SUPPORT_LANES: readonly SupportLane[] = [
  'cycle-self', 'cycle-partner', 'mens-health', 'general',
];

export const LANE_NAMES: Record<SupportLane, string> = {
  'cycle-self': 'For a rough day',
  'cycle-partner': 'Helping them through one',
  'mens-health': "Men's health",
  general: 'For either of you',
};

export interface LaneInput {
  /** Undefined when the question has not been put yet. */
  gender: Gender | undefined;
  tracksCycle: boolean;
  partnerTracksCycle: boolean;
}

/**
 * The lanes on, in the order they should be offered.
 *
 * `general` is always last and always present: there is no configuration of
 * this couple that leaves somebody with an empty screen.
 */
export function lanesFor({ gender, tracksCycle, partnerTracksCycle }: LaneInput): SupportLane[] {
  const lanes: SupportLane[] = [];
  if (tracksCycle) lanes.push('cycle-self');
  if (partnerTracksCycle) lanes.push('cycle-partner');
  if (gender === 'male') lanes.push('mens-health');
  lanes.push('general');
  return lanes;
}
