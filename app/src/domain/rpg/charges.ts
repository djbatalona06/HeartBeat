import type { Activity, Charge, Element, MoveStyle, RaidStatsDto } from '../../features/eve-garden/engine/types';
import { gearLift } from './loadout';
import type { DayKey, MemberId } from '../types';

/**
 * What today's logging is worth in Eve's Garden.
 *
 * A log is not a move, and the garden has no logging controls at all. Logging
 * a workout on the exercise page, a study session on the calendar, or a mood —
 * with "rested", "grateful" and "ate well" ticked on the same check-in — lights
 * a **charge** for the day, and the charges change how the companion's moves
 * land. The arithmetic is `Charges.cs`; this module decides which are lit,
 * says in words what each one does, and restates the multipliers for the meter.
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
  /** What to do today to light it, finishing "once you log …" or "Log … today". */
  nudge: string;
}

export const CHARGE_COPY: Record<Charge, ChargeCopy> = {
  Exercise: { label: 'Workout', effect: 'Physical moves +25%', nudge: 'a workout' },
  Work: { label: 'Study & work', effect: 'Magic moves +25%', nudge: 'some study or focused work' },
  Mood: { label: 'Mood', effect: 'Wards +25%', nudge: 'how you feel' },
  Rest: { label: 'Rest', effect: 'Mend heals +50%', nudge: 'a proper rest' },
  Gratitude: { label: 'Gratitude', effect: 'Start behind a ward', nudge: 'something you are grateful for' },
  Nourish: { label: 'Ate well', effect: '+15% max HP', nudge: 'a good meal' },
  Bond: { label: 'Both of you', effect: 'Every hit +10%', nudge: 'something each, the two of you' },
  Balance: { label: 'Three kinds', effect: 'You go first', nudge: 'three different kinds of thing' },
};

/** One thing somebody logged today. */
export interface TodayRow {
  memberId: MemberId;
  activity: Activity;
}

export interface ChargeInput {
  /**
   * Today's rows from either partner: mood, exercise and hand-logged work, plus
   * one Rest / Gratitude / Nourish row for each flag ticked on a mood check-in.
   */
  rows: readonly TodayRow[];
}

/**
 * The award id the garden pays a lit charge's XP under, once a day. The same
 * id on both phones, so `awardPetXp` pays it once however many see it lit.
 */
export function gardenAwardId(day: DayKey, activity: Activity): string {
  return `garden-${day}-${activity}`;
}

/** Which charges are lit today, in `CHARGES` order. */
export function chargesFor({ rows }: ChargeInput): Charge[] {
  const lit = new Set<Charge>();

  for (const { charge, activity } of LOGGABLE) {
    if (rows.some((row) => row.activity === activity)) lit.add(charge);
  }

  if (new Set(rows.map((row) => row.memberId)).size >= 2) lit.add('Bond');
  if (lit.size - (lit.has('Bond') ? 1 : 0) >= BALANCE_KINDS) lit.add('Balance');

  return CHARGES.filter((charge) => lit.has(charge));
}

/** The charges that come from one log, and so pay XP. Bond and Balance are earned. */
export function payingActivities(charges: readonly Charge[]): Activity[] {
  return LOGGABLE.filter(({ charge }) => charges.includes(charge)).map(({ activity }) => activity);
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

/* -- what the move bar shows ------------------------------------------------- */

/** Mirrors `Charges.cs` and `Battle.WeaknessMultiplier`; `charges.test.ts` reads both. */
export const STYLE_BONUS = 0.25;
export const MEND_BONUS = 0.5;
export const BOND_BONUS = 0.1;
export const WEAKNESS_MULTIPLIER = 1.5;

/** Which charge feeds each move style. Mirrors `Charges.StyleOf`. */
export const FEEDS: Partial<Record<MoveStyle, Charge>> = {
  Physical: 'Exercise',
  Magic: 'Work',
  Defensive: 'Mood',
  Mend: 'Rest',
};

/** A full boost bar. Past this the bar stays full; the number keeps counting. */
export const LIFT_FULL = 150;

export interface LiftInput {
  charges: readonly Charge[];
  stats: RaidStatsDto;
  style: MoveStyle;
  /** The monster in front of you, when there is one. */
  weakness?: Element;
  strength?: Element;
}

/**
 * How much today's charges and the raid sheet lift one move, as a whole
 * percentage. The same product `Battle.PreviewDamage` takes for a hit and
 * `Battle.Act` takes for a ward or a heal — restated here only so the bar can
 * be drawn without a round trip. Never below zero: a charge only ever helps.
 */
export function moveLift({ charges, stats, style, weakness, strength }: LiftInput): number {
  let multiplier = 1;
  const fed = FEEDS[style];
  if (fed && charges.includes(fed)) {
    let bonus = fed === 'Rest' ? MEND_BONUS : STYLE_BONUS;
    if (CHARGE_ELEMENT[fed] === strength) bonus /= 2;
    multiplier *= 1 + bonus;
  }
  const hits = style === 'Physical' || style === 'Magic' || style === 'Together';
  if (hits && chargeOnWeakness(charges, weakness)) multiplier *= WEAKNESS_MULTIPLIER;
  if (hits && charges.includes('Bond')) multiplier *= 1 + BOND_BONUS;
  multiplier *= 1 + gearLift(stats, style) / 100;
  return Math.max(0, Math.round((multiplier - 1) * 100));
}
