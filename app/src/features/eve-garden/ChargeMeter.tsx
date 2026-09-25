import type { Charge, Element } from './engine/types';
import { CHARGE_COPY, CHARGE_ELEMENT, LOGGABLE, chargeOnWeakness } from '../../domain/rpg/charges';
import { Icon } from '../../components/icons';

/**
 * Today's charges, as a meter beside the move pad.
 *
 * Display only, on purpose: the garden has no logging controls. Every segment
 * lights from a row the rest of the app already writes — a workout on the
 * exercise page, study on the calendar, a mood check-in and its three flags —
 * so the meter is a mirror of the day, not a second place to fill it in.
 *
 * The segment on the monster's weakness carries a sparkle and says so in words,
 * because a colour on its own is not an answer for everybody.
 */

export interface ChargeMeterProps {
  charges: readonly Charge[];
  weakness?: Element;
}

const SHORT: Record<Charge, string> = {
  Exercise: 'Workout',
  Work: 'Study',
  Mood: 'Mood',
  Rest: 'Rest',
  Gratitude: 'Grateful',
  Nourish: 'Meal',
  Bond: 'Both',
  Balance: '3 kinds',
};

const EARNED: readonly Charge[] = ['Bond', 'Balance'];

export function ChargeMeter({ charges, weakness }: ChargeMeterProps) {
  const lit = new Set(charges);
  const logged = LOGGABLE.filter(({ charge }) => lit.has(charge)).length;
  const answer = chargeOnWeakness(charges, weakness);
  const wanted = weakness
    ? (Object.keys(CHARGE_ELEMENT) as Charge[]).find((c) => CHARGE_ELEMENT[c] === weakness)
    : undefined;

  const segment = (charge: Charge) => {
    const on = lit.has(charge);
    const isAnswer = charge === (answer ?? wanted);
    return (
      <li
        key={charge}
        className="garden-meter-seg"
        data-on={on || undefined}
        data-answer={isAnswer || undefined}
        title={`${CHARGE_COPY[charge].label}: ${CHARGE_COPY[charge].effect}`}
      >
        <span className="garden-meter-fill" aria-hidden="true" />
        <span className="garden-meter-label">
          {SHORT[charge]}
          {isAnswer ? <Icon name="sparkle" /> : null}
        </span>
      </li>
    );
  };

  const spoken = charges.length === 0
    ? 'Nothing charged yet today.'
    : `Charged: ${charges.map((c) => CHARGE_COPY[c].label.toLowerCase()).join(', ')}.`;

  return (
    <aside className="garden-meter" aria-label="Today's charges">
      <p className="garden-meter-head">
        <span>Charge</span>
        <span className="garden-meter-count">{logged}/{LOGGABLE.length}</span>
      </p>
      <p className="visually-hidden">
        {spoken}
        {answer ? ` ${CHARGE_COPY[answer].label} is on its weakness.` : ''}
        {!answer && wanted ? ` It is weak to ${CHARGE_COPY[wanted].label.toLowerCase()}.` : ''}
      </p>
      <ul className="garden-meter-list" aria-hidden="true">
        {LOGGABLE.map(({ charge }) => segment(charge))}
      </ul>
      <ul className="garden-meter-list garden-meter-earned" aria-hidden="true">
        {EARNED.map(segment)}
      </ul>
      {answer ? (
        <p className="garden-meter-note">Weakness hit · ×1.5</p>
      ) : wanted ? (
        <p className="garden-meter-note">Weak to {SHORT[wanted].toLowerCase()} ✦</p>
      ) : null}
    </aside>
  );
}
