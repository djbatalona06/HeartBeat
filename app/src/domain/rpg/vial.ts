import type { Charge } from '../../features/eve-garden/engine/types';
import { LOGGABLE } from './charges';

/**
 * The heart vial beside the move pad: today's charges as layers of coloured
 * sand, poured in the order the day's logs are listed.
 *
 * Six loggable charges, six colours, one band each. The two earned charges
 * (Bond, Balance) are not sand -- nobody logs them -- so they are flags the
 * drawing shows on the glass and the cork. Pure; `ChargeMeter` draws it.
 */

export type LoggableCharge = 'Exercise' | 'Work' | 'Mood' | 'Rest' | 'Gratitude' | 'Nourish';

/**
 * One hue per loggable charge. Fixed rather than read from the theme pack: a
 * pack has one accent and the vial needs six things told apart at a glance.
 * Each sits between 0.10 and 0.30 relative luminance, which is what keeps it
 * at 3:1 or better against both a white and a black surface (WCAG's bar for a
 * graphic), so the same six work in every pack's light and dark palette.
 * `vial.test.ts` holds both of those. The CSS leans each a little towards the
 * pack's accent so the vial still belongs to the theme it is drawn in.
 */
export const SAND: Record<LoggableCharge, string> = {
  Exercise: '#D9542F',
  Work: '#3D7DD8',
  Mood: '#C2448F',
  Rest: '#7A5CC9',
  Gratitude: '#B8860B',
  Nourish: '#3E9A4F',
};

/** The words beside each band, short enough for a 6.5rem column. */
export const SAND_LABEL: Record<LoggableCharge, string> = {
  Exercise: 'Workout',
  Work: 'Study',
  Mood: 'Mood',
  Rest: 'Rest',
  Gratitude: 'Grateful',
  Nourish: 'Meal',
};

/** How many bands a full vial holds. */
export const VIAL_SLOTS = LOGGABLE.length;

export interface VialLayer {
  charge: LoggableCharge;
  colour: string;
  /** 0 is the bottom band. */
  index: number;
}

export interface Vial {
  /** Lit loggable charges, bottom first, in `LOGGABLE` order. */
  layers: VialLayer[];
  /** 0..1, how full the heart is. */
  fill: number;
  /** Both of you logged today: a twin glint on the glass. */
  bond: boolean;
  /** Three kinds of log today: the cork lights. */
  balance: boolean;
}

/**
 * Today's vial from today's charges. A stable order rather than the order the
 * logs happened in, so the same day always looks the same on both phones.
 */
export function vialFor(charges: readonly Charge[]): Vial {
  const lit = new Set(charges);
  const layers = LOGGABLE
    .filter(({ charge }) => lit.has(charge))
    .map(({ charge }, index) => ({
      charge: charge as LoggableCharge,
      colour: SAND[charge as LoggableCharge],
      index,
    }));
  return {
    layers,
    fill: layers.length / VIAL_SLOTS,
    bond: lit.has('Bond'),
    balance: lit.has('Balance'),
  };
}
