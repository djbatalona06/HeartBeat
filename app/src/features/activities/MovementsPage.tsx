import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MOVE_SETS, moveAt, setSeconds, type MoveSet } from '../../domain/selfcare/movements';
import { clock, useElapsed } from './useElapsed';

/**
 * Short movement sets, counted through one at a time.
 *
 * Not the workout log: `features/exercise/` is for a session you went and did,
 * with a duration and camera proof, and this pays nothing at all. Keeping them
 * apart is what stops "stood up and stretched" competing with a real workout in
 * the same list, and what lets this one be genuinely small.
 */
export function MovementsPage() {
  const [set, setSet] = useState<MoveSet>(MOVE_SETS[0]);
  const [running, setRunning] = useState(false);
  const [elapsed, reset] = useElapsed(running);

  const at = moveAt(set, elapsed);
  const finished = at === null && elapsed > 0;

  function choose(next: MoveSet) {
    setSet(next);
    setRunning(false);
    reset();
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Movements</h1>
        <p className="page-sub">{set.blurb}</p>
      </header>

      <Link className="goal-link" to="/activities">← Activities</Link>

      <section className="panel">
        <h2 className="section-title">{set.name}</h2>
        <p className="section-sub">
          {clock(setSeconds(set))} · no equipment, no floor
        </p>

        {finished ? (
          <p className="move-now">That is the set. Nicely done.</p>
        ) : at ? (
          <div className="move-now">
            <span className="move-name">{at.move.name}</span>
            <span className="move-count">{at.remaining}</span>
            <span className="move-how">{at.move.how}</span>
          </div>
        ) : (
          <p className="move-now">{set.moves.length} moves. Press start and follow along.</p>
        )}

        <p className="visually-hidden" role="status" aria-live="polite">
          {running && at ? at.move.name : ''}
        </p>

        <div className="row">
          <button type="button" className="primary" onClick={() => setRunning(!running)}>
            {running ? 'Pause' : elapsed > 0 && !finished ? 'Carry on' : 'Start'}
          </button>
          {elapsed > 0 ? (
            <button
              type="button"
              className="chip"
              onClick={() => { setRunning(false); reset(); }}
            >
              Reset
            </button>
          ) : null}
        </div>

        <ol className="move-list">
          {set.moves.map((move, i) => (
            <li
              className="move-row"
              key={move.name}
              data-state={at && i === at.index ? 'now' : at && i < at.index ? 'done' : finished ? 'done' : ''}
            >
              <span className="move-row-name">{move.name}</span>
              <span className="move-row-time">{move.seconds}s</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2 className="section-title">Sets</h2>
        <div className="chips" role="radiogroup" aria-label="Set">
          {MOVE_SETS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={set.id === s.id}
              className={`chip move-chip ${set.id === s.id ? 'chip-on' : ''}`}
              onClick={() => choose(s)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
