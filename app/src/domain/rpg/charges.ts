import type { Activity, Charge, Element } from '../../features/eve-garden/engine/types';
import type { DayKey, MemberId } from '../types';

/**
 * What today's logging is worth in Eve's Garden.
 *
 * A log is not a move. Logging a workout on the exercise page, a study session
 * on the calendar, a mood, or a night's rest from the garden's charge strip
 * lights a **charge** for the day, and the charges change how the companion's
 * moves land. The arithmetic is `Charges.cs`; this module only decides which
 * are lit, and says in words what each one does.
 *
 * Two of them cannot be logged at all. **Bond** lights when both of you have
 * logged something today, and **Balance** when three different kinds of log
 * have. Islands 6 and 7 are weak to exactly those, which is the point: the last
 * two islands are about the two of you, and about everything at once.
 *
 * Pure. The rows come from `db/repository/charges.ts`.
 */

export const CHARGES: readonly Charge[] = [
  'Exercise', 'Work', 'Mood', 'Rest', 'Gratitude', 'Nourish', 'Bond', 'Balance',
];

/** The charges a single log can light, and the activity that lights each. */
export const LOGGABLE: readonly { charge: Charge; activity: Activity }[] = [
  { charge: 'Exercise', activity: 'Exercise' },
  { charge: 'Work', activity: 'Work' },
  { charge: 'Mood', activity: 'Mood' },
  { charge: 'Rest', activity: 'Rest' },
  { charge: 'Gratitude', activity: 'Gratitude' },
  { charge: 'Nourish', activity: 'Nourish' },
];

/** Three kinds of log in a day is Balance. */
export const BALANCE_KINDS = 3;

/** Mirrors `Charges.ElementOf` in C#; `charges.test.ts` reads the switch to hold them together. */
export const CHARGE_ELEMENT: Record<Charge, Element> = {
  Exercise: 'Movement',
  Work: 'Focus',
  Mood: 'Mood',
  Rest: 'Rest',
  Gratitude: 'Mood',
  Nourish: 'Nourishment',
  Bond: 'Bond',
  Balance: 'Balance',
};

export interface ChargeCopy {
  /** What it is, in the words a person would use. */
  label: string;
  /** What it does in a fight. The numbers are `Charges.cs`'s constants. */
  effect: string;
  /** The button text for logging it from the strip, when it can be logged. */
  log?: string;
  /** What to do today to light it, finishing "once you log …" or "Log … today". */
  nudge: string;
}

export const CHARGE_COPY: Record<Charge, ChargeCopy> = {
  Exercise: { label: 'Workout', effect: 'Physical moves +25%', log: 'Worked out', nudge: 'a workout' },
  Work: { label: 'Study & work', effect: 'Magic moves +25%', log: 'Studied', nudge: 'some study or focused work' },
  Mood: { label: 'Mood', effect: 'Wards +25%', log: 'Checked in', nudge: 'how you feel' },
  Rest: { label: 'Rest', effect: 'Mend heals +50%', log: 'Rested', nudge: 'a proper rest' },
  Gratitude: { label: 'Gratitude', effect: 'Start behind a ward', log: 'Grateful', nudge: 'something you are grateful for' },
  Nourish: { label: 'Ate well', effect: '+15% max HP', log: 'Ate well', nudge: 'a good meal' },
  Bond: { label: 'Both of you', effect: 'Every hit +10%', nudge: 'something each, the two of you' },
  Balance: { label: 'Three kinds', effect: 'You go first', nudge: 'three different kinds of thing' },
};

/** One thing somebody logged today. */
export interface TodayRow {
  memberId: MemberId;
  activity: Activity;
}

export interface ChargeInput {
  day: DayKey;
  /** Mood, exercise and hand-logged work rows for today, from either partner. */
  rows: readonly TodayRow[];
  /**
   * The pet's recent award ids. Rest, Gratitude and Nourish have no table —
   * their `garden-<day>-<activity>` XP award is the only record they happened.
   */
  awardIds: readonly string[];
}

/** The award id the garden pays a log under. The same one `awardPetXp` dedups on. */
export function gardenAwardId(day: DayKey, activity: Activity): string {
  return `garden-${day}-${activity}`;
}

/** Which charges are lit today, in `CHARGES` order. */
export function chargesFor({ day, rows, awardIds }: ChargeInput): Charge[] {
  const awarded = new Set(awardIds);
  const lit = new Set<Charge>();

  for (const { charge, activity } of LOGGABLE) {
    if (rows.some((row) => row.activity === activity) || awarded.has(gardenAwardId(day, activity))) {
      lit.add(charge);
    }
  }

  if (new Set(rows.map((row) => row.memberId)).size >= 2) lit.add('Bond');
  if (lit.size - (lit.has('Bond') ? 1 : 0) >= BALANCE_KINDS) lit.add('Balance');

  return CHARGES.filter((charge) => lit.has(charge));
}

/** True when a charge hits what the monster is weak to. The hint the move bar shows. */
export function chargeOnWeakness(charges: readonly Charge[], weakness: Element | undefined): Charge | undefined {
  if (!weakness) return undefined;
  return charges.find((charge) => CHARGE_ELEMENT[charge] === weakness);
}

/** The charge that answers an element, for the "log this" nudge. */
export function chargeForElement(element: Element): Charge {
  return CHARGES.find((charge) => CHARGE_ELEMENT[charge] === element) ?? 'Mood';
}
