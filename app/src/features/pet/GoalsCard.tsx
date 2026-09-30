import { goals, nextGoals, type UnlockState } from '../../domain/rpg/unlocks';

/**
 * The long goals, with their real numbers, from the first day.
 *
 * Two at a time, nearest first, because a list of every goal is a to-do list
 * and two is a direction. Each one says exactly where it stands — "1,047 of
 * 1,200 · 87%", never a percentage alone — because a bar without a number is a
 * mood and a number is something you can plan around.
 *
 * Nothing here counts down or can go backwards: every goal reads a lifetime
 * total (`domain/rpg/unlocks.ts`). The wording is about what the two of you are
 * building, not what is still missing.
 */

const count = (n: number) => n.toLocaleString();

export function GoalsCard({ state }: { state: UnlockState }) {
  const ahead = nextGoals(state);
  const reached = goals(state).filter((goal) => goal.check.eligible);

  return (
    <section className="together goals" aria-labelledby="goals-title">
      <h2 id="goals-title" className="section-title">What you are growing towards</h2>

      {ahead.length === 0 ? (
        <p className="section-sub">Every one of them is yours now. Nothing here can be taken back.</p>
      ) : (
        <ul className="goals-list">
          {ahead.map(({ unlock, check }) => {
            // Floored, so a bar never reads 100% before it has actually opened.
            const percent = Math.floor(check.progress * 100);
            const words = `${count(check.have)} of ${count(check.need)} ${unlock.unit}`;
            return (
              <li key={unlock.id} className="goal">
                <div className="goal-head">
                  <span className="goal-name">{unlock.name}</span>
                  <span className="goal-number">{count(check.have)} of {count(check.need)} · {percent}%</span>
                </div>
                <div
                  className="goal-bar"
                  role="progressbar"
                  aria-label={unlock.name}
                  aria-valuemin={0}
                  aria-valuemax={check.need}
                  aria-valuenow={Math.min(check.have, check.need)}
                  aria-valuetext={words}
                >
                  <span className="goal-fill" style={{ width: `${percent}%` }} />
                </div>
                <p className="goal-blurb">{unlock.blurb}</p>
              </li>
            );
          })}
        </ul>
      )}

      {reached.length > 0 && ahead.length > 0 && (
        <p className="section-sub goals-reached">
          Already yours: {reached.map((goal) => goal.unlock.name).join(', ')}.
        </p>
      )}
    </section>
  );
}
