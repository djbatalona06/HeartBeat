import type { Activity, Charge, Element } from './engine/types';
import { CHARGE_COPY, CHARGE_ELEMENT, LOGGABLE } from '../../domain/rpg/charges';
import { Chip } from '../../ui/Chip';

/**
 * Today's charges, and the quickest way to light one.
 *
 * This is where logging lives in Eve's Garden now — beside the move bar rather
 * than in it. A lit chip says what it is doing to the fight; an unlit one is a
 * one-tap log that writes the same row the proper page would (see
 * `logging.ts`). Bond and Balance cannot be logged, only earned, so they are
 * shown and never pressed.
 *
 * The chip whose element is the monster's weakness is marked, because "what
 * should we do today" deserves an answer on the screen that asks it.
 */

export interface ChargeStripProps {
  charges: readonly Charge[];
  weakness?: Element;
  busy: boolean;
  onLog(activity: Activity): void;
}

export function ChargeStrip({ charges, weakness, busy, onLog }: ChargeStripProps) {
  const lit = new Set(charges);
  const derived: Charge[] = ['Bond', 'Balance'];

  return (
    <section className="garden-charges" aria-label="Today's charges">
      <h2 className="garden-charges-title">Today&rsquo;s charges</h2>
      <ul className="garden-charge-list">
        {LOGGABLE.map(({ charge, activity }) => {
          const on = lit.has(charge);
          const answer = CHARGE_ELEMENT[charge] === weakness;
          const copy = CHARGE_COPY[charge];
          return (
            <li key={charge} className={`garden-charge-slot${answer ? ' is-answer' : ''}`}>
              {/* A lit chip has nothing left to do — the log is idempotent and
                  the award is paid once a day — so pressing it again is a
                  no-op rather than a disabled control. */}
              <Chip on={on} onClick={() => { if (!on && !busy) onLog(activity); }}>
                <span className="garden-charge-name">{on ? copy.label : copy.log}</span>
                <span className="garden-charge-effect">
                  {copy.effect}
                  {answer ? ' · its weakness' : ''}
                </span>
              </Chip>
            </li>
          );
        })}
        {derived.map((charge) => {
          const on = lit.has(charge);
          const answer = CHARGE_ELEMENT[charge] === weakness;
          return (
            <li key={charge} className={`garden-charge-slot${answer ? ' is-answer' : ''}`}>
              <span className={`garden-charge-earned${on ? ' is-lit' : ''}`}>
                <span className="garden-charge-name">{CHARGE_COPY[charge].label}</span>
                <span className="garden-charge-effect">
                  {on ? CHARGE_COPY[charge].effect : charge === 'Bond' ? 'Both of you log today' : 'Three kinds of log today'}
                  {answer ? ' · its weakness' : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
