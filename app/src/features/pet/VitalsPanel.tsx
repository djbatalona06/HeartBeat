import { RADIANCE_FLOOR, RADIANCE_FULL, SHIELD_EVERY, type Attribute, type Vitals } from '../../domain/rpg/vitals';

/**
 * What the two of you have made of the pet: three attributes, the shared
 * streak, and the glow.
 *
 * It sits under the pet on Home rather than on a screen of its own because it
 * is the answer to the question the pet already asks. The bars are the point:
 * a bird that is bright but unbonded is a couple who have both been logging and
 * never on the same day, and that is a sentence neither of them would have said
 * out loud. Nothing here names who did what — see `domain/rpg/vitals.ts` for
 * why the whole feature refuses to.
 *
 * Handed the numbers rather than reading them, because Home dims the mascot
 * itself by the same radiance — one live query on the page, two things drawn
 * from it, instead of two queries that could disagree for a frame.
 */

/** The glow, as 0..1, for whatever is being dimmed by it. */
export function glowOf(vitals: Vitals): number {
  return (vitals.radiance - RADIANCE_FLOOR) / (RADIANCE_FULL - RADIANCE_FLOOR);
}

const BARS: { key: Attribute; name: string; hint: string }[] = [
  { key: 'vitality', name: 'Vitality', hint: 'Workouts' },
  { key: 'serenity', name: 'Serenity', hint: 'Moods and check-ins' },
  { key: 'bond', name: 'Bond', hint: 'Days you both showed up' },
];

export function VitalsPanel({ vitals }: { vitals: Vitals | undefined }) {
  if (!vitals) return null;

  // Each bar is read against the largest of the three rather than against a
  // fixed ceiling: the three attributes grow at different rates by design, and
  // what anyone actually wants from this picture is which one is behind.
  const top = Math.max(1, ...BARS.map((bar) => vitals.attributes[bar.key]));

  return (
    <section className="vitals" style={{ '--vitals-glow': glowOf(vitals) } as React.CSSProperties}>
      <div className="vitals-head">
        <h2 className="section-title">Together</h2>
        <span className="vitals-stage" title={vitals.stage.blurb}>{vitals.stage.name}</span>
      </div>

      <ul className="vitals-bars">
        {BARS.map((bar) => {
          const value = vitals.attributes[bar.key];
          return (
            <li className="vitals-bar" key={bar.key}>
              <div className="vitals-bar-head">
                <span className="vitals-bar-name">{bar.name}</span>
                <span className="vitals-bar-value">{value}</span>
              </div>
              <div
                className="vitals-bar-track"
                role="meter"
                aria-label={`${bar.name}, from ${bar.hint.toLowerCase()}`}
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={top}
              >
                <div
                  className="vitals-bar-fill"
                  data-attribute={bar.key}
                  style={{ width: `${(value / top) * 100}%` }}
                />
              </div>
              <span className="vitals-bar-hint">{bar.hint}</span>
            </li>
          );
        })}
      </ul>

      <p className="vitals-streak">
        <StreakLine vitals={vitals} />
      </p>

      <p className="section-sub">
        {vitals.remaining.length
          ? `Next: ${vitals.next?.name} — ${vitals.remaining.join(', ')}.`
          : vitals.stage.blurb}
      </p>
    </section>
  );
}

/**
 * The streak, said in a way that cannot be read as an accusation.
 *
 * A day nobody has logged yet is "waiting on one of you", not "broken", and it
 * is never attributed — either of you can keep it, so there is nothing to
 * confess. A shield in hand is named as insurance so it is understood *before*
 * it is needed, which is the only time knowing about it helps.
 */
function StreakLine({ vitals }: { vitals: Vitals }) {
  const { days, shieldsLeft, shieldsSpent, loggedToday } = vitals.streak;

  if (days === 0) {
    return <>No streak yet — anything either of you logs today starts one.</>;
  }

  return (
    <>
      <strong>{days}-day streak</strong>
      {loggedToday ? ' · kept today' : ' · waiting on one of you'}
      {shieldsSpent > 0 ? ` · ${shieldsSpent === 1 ? 'a shield is' : `${shieldsSpent} shields are`} holding a gap` : ''}
      {shieldsLeft > 0
        ? ` · ${shieldsLeft} shield${shieldsLeft === 1 ? '' : 's'} in hand`
        : ` · a shield every ${SHIELD_EVERY} days you both log`}
    </>
  );
}
