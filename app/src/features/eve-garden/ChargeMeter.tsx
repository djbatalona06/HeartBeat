import { useId, type CSSProperties } from 'react';
import type { Charge, Element } from './engine/types';
import { CHARGE_COPY, CHARGE_ELEMENT, LOGGABLE, chargeOnWeakness } from '../../domain/rpg/charges';
import { SAND, SAND_LABEL, VIAL_SLOTS, vialFor, type LoggableCharge } from '../../domain/rpg/vial';
import { Icon } from '../../components/icons';
import { InfoBubble } from '../../ui/InfoBubble';
import { GUIDES } from '../guide/guides';

/**
 * Today's charges, as a heart-shaped vial of coloured sand beside the move pad.
 *
 * Display only, on purpose: the garden has no logging controls. Every band is
 * poured by a row the rest of the app already writes -- a workout on the
 * exercise page, study on the calendar, a mood check-in and its three flags --
 * so the vial is a mirror of the day, not a second place to fill it in.
 *
 * One colour per kind of log (`domain/rpg/vial.ts`), and a legend that names
 * each in words, because a colour on its own is not an answer for everybody.
 * The two charges nobody logs are not sand: **Both of you** glints on the
 * glass, **Three kinds** lights the cork. The band on the monster's weakness
 * carries a ✦, in the drawing and in the legend.
 *
 * The component keeps the name and props it had as a bar meter, so the page
 * that mounts it did not change.
 */

export interface ChargeMeterProps {
  charges: readonly Charge[];
  weakness?: Element;
}

/* The vial's geometry, in a 100 x 112 box. The sand sits between FLOOR and
   BRIM; each band is one sixth of that height. */
const HEART = 'M50 108 C20 88 4 68 4 46 C4 28 18 18 32 18 C40 18 46 22 50 28 C54 22 60 18 68 18 C82 18 96 28 96 46 C96 68 80 88 50 108 Z';
const FLOOR = 108;
const BRIM = 26;
const BAND = (FLOOR - BRIM) / VIAL_SLOTS;

export function ChargeMeter({ charges, weakness }: ChargeMeterProps) {
  const id = useId().replace(/:/g, '');
  const vial = vialFor(charges);
  const answer = chargeOnWeakness(charges, weakness);
  const wanted = weakness
    ? (Object.keys(CHARGE_ELEMENT) as Charge[]).find((c) => CHARGE_ELEMENT[c] === weakness)
    : undefined;
  const marked = answer ?? wanted;
  const lit = new Set(charges);

  const spoken = charges.length === 0
    ? 'Nothing charged yet today.'
    : `Charged: ${charges.map((c) => CHARGE_COPY[c].label.toLowerCase()).join(', ')}.`;

  return (
    <aside className="garden-meter garden-vial" aria-label="Today's charges">
      <p className="garden-meter-head">
        <InfoBubble guide={GUIDES.charges} />
        <span>Charge</span>
        <span className="garden-meter-count">{vial.layers.length}/{VIAL_SLOTS}</span>
      </p>
      <p className="visually-hidden">
        {spoken}
        {answer ? ` ${CHARGE_COPY[answer].label} is on its weakness.` : ''}
        {!answer && wanted ? ` It is weak to ${CHARGE_COPY[wanted].label.toLowerCase()}.` : ''}
      </p>

      <svg
        className="garden-vial-art"
        viewBox="0 0 100 112"
        aria-hidden="true"
        data-full={vial.fill === 1 || undefined}
      >
        <defs>
          <clipPath id={`vial-${id}`}>
            <path d={HEART} />
          </clipPath>
          {/* Grain, so a band reads as sand rather than paint. */}
          <pattern id={`grain-${id}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.7" fill="var(--color-surface)" opacity="0.35" />
            <circle cx="4.5" cy="4" r="0.6" fill="var(--shadow-color)" opacity="0.5" />
          </pattern>
        </defs>

        {/* The neck and the cork. Three kinds of log today lights the cork. */}
        <rect className="garden-vial-neck" x="43" y="10" width="14" height="18" rx="3" />
        <rect className="garden-vial-cork" data-on={vial.balance || undefined} x="41" y="3" width="18" height="10" rx="3" />

        <g clipPath={`url(#vial-${id})`}>
          <rect className="garden-vial-glass-fill" x="0" y="0" width="100" height="112" />
          {vial.layers.map((layer) => {
            const top = FLOOR - (layer.index + 1) * BAND;
            return (
              <g
                key={layer.charge}
                className="garden-vial-band"
                style={{ '--sand': layer.colour, '--pour': layer.index } as CSSProperties}
              >
                <rect x="0" y={top} width="100" height={BAND + 0.6} fill="var(--sand-lean)" />
                <rect x="0" y={top} width="100" height={BAND + 0.6} fill={`url(#grain-${id})`} />
                {layer.charge === marked ? (
                  <path
                    className="garden-vial-star"
                    transform={`translate(78 ${top + BAND / 2})`}
                    d="M0 -4.5 L1.2 -1.2 L4.5 0 L1.2 1.2 L0 4.5 L-1.2 1.2 L-4.5 0 L-1.2 -1.2 Z"
                  />
                ) : null}
              </g>
            );
          })}
        </g>

        {/* The glass, drawn over the sand so the outline stays crisp. */}
        <path className="garden-vial-glass" d={HEART} />
        <path className="garden-vial-shine" d="M18 40 C18 32 24 27 31 26" />
        {/* Both of you logged today: two glints, one on each lobe. */}
        {vial.bond ? (
          <g className="garden-vial-glint">
            <path d="M28 34 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" />
            <path d="M72 34 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" />
          </g>
        ) : null}
      </svg>

      <ul className="garden-vial-legend" aria-hidden="true">
        {LOGGABLE.map(({ charge }) => {
          const key = charge as LoggableCharge;
          return (
            <li
              key={key}
              data-on={lit.has(charge) || undefined}
              title={`${CHARGE_COPY[charge].label}: ${CHARGE_COPY[charge].effect}`}
              style={{ '--sand': SAND[key] } as CSSProperties}
            >
              <span className="garden-vial-dot" />
              {SAND_LABEL[key]}
              {charge === marked ? <Icon name="sparkle" /> : null}
            </li>
          );
        })}
      </ul>
      <p className="garden-vial-earned" aria-hidden="true">
        <span data-on={vial.bond || undefined}>
          Both{marked === 'Bond' ? <Icon name="sparkle" /> : null}
        </span>
        <span data-on={vial.balance || undefined}>
          3 kinds{marked === 'Balance' ? <Icon name="sparkle" /> : null}
        </span>
      </p>

      {answer ? (
        <p className="garden-meter-note">Weakness hit · ×1.5</p>
      ) : wanted ? (
        <p className="garden-meter-note">
          Weak to {(wanted in SAND ? SAND_LABEL[wanted as LoggableCharge] : CHARGE_COPY[wanted].label).toLowerCase()} ✦
        </p>
      ) : null}
    </aside>
  );
}
