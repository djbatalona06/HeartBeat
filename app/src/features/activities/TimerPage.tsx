import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clock, useElapsed } from './useElapsed';

/** The lengths worth one tap. Anything else is what the +1 button is for. */
const PRESETS = [1, 3, 5, 10, 20, 25];

/**
 * A timer, and deliberately only a timer.
 *
 * No sessions, no history, no XP. This is the thing you reach for when
 * something is in the oven or you have agreed to look at a hard task for five
 * minutes, and attaching a reward to it would make it a chore with a score.
 *
 * It counts down by reading the clock rather than decrementing — see
 * `useElapsed` — so leaving the screen and coming back shows the real
 * remaining time rather than however far a paused counter got.
 */
export function TimerPage() {
  const [minutes, setMinutes] = useState(5);
  const [running, setRunning] = useState(false);
  const [elapsed, reset] = useElapsed(running);
  const [done, setDone] = useState(false);

  const total = minutes * 60;
  const left = Math.max(0, total - elapsed);

  useEffect(() => {
    if (running && left <= 0) {
      setRunning(false);
      setDone(true);
    }
  }, [running, left]);

  function choose(next: number) {
    setMinutes(next);
    setRunning(false);
    setDone(false);
    reset();
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Timer</h1>
        <p className="page-sub">For a rest, a task, or a pot of something.</p>
      </header>

      <Link className="goal-link" to="/activities">← Activities</Link>

      <section className="panel timer">
        <div className="timer-face" role="timer" aria-live="off">
          {done ? 'Done' : clock(left)}
        </div>

        {/* Announced once, on the change, rather than every second. */}
        <p className="visually-hidden" role="status" aria-live="polite">
          {done ? 'Timer finished' : running ? 'Timer running' : ''}
        </p>

        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => { setDone(false); setRunning(!running); }}
            disabled={left <= 0 && !done}
          >
            {running ? 'Pause' : elapsed > 0 && !done ? 'Carry on' : 'Start'}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => { setRunning(false); setDone(false); reset(); }}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">How long?</h2>
        <div className="chips" role="radiogroup" aria-label="Length">
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={minutes === m}
              className={`chip ${minutes === m ? 'chip-on' : ''}`}
              onClick={() => choose(m)}
            >
              {m} min
            </button>
          ))}
          <button type="button" className="chip" onClick={() => choose(Math.min(120, minutes + 1))}>
            +1
          </button>
        </div>
      </section>
    </div>
  );
}
