import type { ProgressDto } from './engine/types';
import type { Vitals } from '../../domain/rpg/vitals';

/**
 * The dashboard, floating over the garden.
 *
 * Eve's Garden is the only page where combat happens and it is also where the
 * couple's numbers live, so these are the tiles the home screen used to own:
 * the shared level, the streak, and how today is going. They are cards rather
 * than a panel because the canvas is behind them and a solid block would hide
 * the thing they are about.
 */

export interface WellnessCardsProps {
  progress: ProgressDto | null;
  vitals: Vitals | undefined;
  /** Days since either of you logged anything. */
  daysSinceLog: number;
  dark: boolean;
}

export function WellnessCards({ progress, vitals, daysSinceLog, dark }: WellnessCardsProps) {
  return (
    <div className="garden-cards">
      <article className="garden-card">
        <h3>Level {progress?.level ?? 1}</h3>
        <div className="garden-card-bar">
          <span style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }} />
        </div>
        <p>
          {progress?.atMaxLevel
            ? 'The top of the curve.'
            : `${progress?.xpIntoLevel ?? 0} / ${progress?.xpForNextLevel ?? 0} XP`}
        </p>
      </article>

      <article className="garden-card">
        <h3>Streak</h3>
        <p className="garden-card-big">{vitals?.streak.days ?? 0}</p>
        <p>
          {vitals?.streak.days === 1 ? 'day' : 'days'} running
          {vitals?.streak.loggedToday === false && vitals.streak.days > 0 ? ' · today is open' : ''}
        </p>
      </article>

      <article className={`garden-card${dark ? ' is-dark' : ''}`}>
        <h3>The light</h3>
        <p>
          {dark
            ? daysSinceLog >= 3
              ? `Quiet for ${daysSinceLog} days. The island has gone dark — log anything and it lifts.`
              : 'A heavy stretch. The island has gone dark; it lifts on its own.'
            : 'Bright. The island is wearing its light face.'}
        </p>
      </article>
    </div>
  );
}
