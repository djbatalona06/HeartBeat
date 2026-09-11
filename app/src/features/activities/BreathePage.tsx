import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PATTERNS,
  PHASE_WORDS,
  cycleSeconds,
  phaseAt,
  scaleAt,
  type Pattern,
} from '../../domain/selfcare/breathing';
import { useTheme } from '../../themes/ThemeProvider';

/**
 * Breathing, counted.
 *
 * All the deciding is in `domain/selfcare/breathing.ts` and none of it is here:
 * this reads the clock every frame and asks a pure function where it is. That
 * is what makes a dropped frame, a backgrounded tab or a slow phone unable to
 * drift the count — there is no accumulating counter to drift.
 *
 * Two accessibility duties, and both are load-bearing rather than decorative.
 * A person who has asked for reduced motion, or turned on the app's own calm
 * mode, gets the words and the countdown with nothing animating: a pulsing
 * circle is exactly the kind of movement that setting exists to stop, and this
 * screen is one somebody might reach *because* they feel unwell. And the phase
 * is announced politely, so it works with the screen off and VoiceOver on —
 * which is arguably the best way to use it.
 */
export function BreathePage() {
  const { calm } = useTheme();
  const [pattern, setPattern] = useState<Pattern>(PATTERNS[0]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const frame = useRef(0);

  // Called unconditionally, then combined. `calm || usePrefersReducedMotion()`
  // short-circuits, so the hook would not run whenever calm mode is on — a
  // conditional hook call, and React throws the moment that toggles.
  const reducedMotion = usePrefersReducedMotion();
  const stiller = calm || reducedMotion;

  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now() - elapsed * 1000;
    const tick = () => {
      setElapsed((performance.now() - startedAt.current) / 1000);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // `elapsed` is deliberately not a dependency: it is what this writes, and
    // listing it would restart the loop on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, pattern.id]);

  const at = phaseAt(pattern, elapsed);
  const scale = scaleAt(at);

  function choose(next: Pattern) {
    setPattern(next);
    setElapsed(0);
    startedAt.current = performance.now();
  }

  function stop() {
    setRunning(false);
    setElapsed(0);
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Breathing</h1>
        <p className="page-sub">{pattern.blurb}</p>
      </header>

      <Link className="goal-link" to="/activities">← Activities</Link>

      <section className="panel breathe">
        <div
          className="breathe-stage"
          data-still={stiller ? 'true' : 'false'}
          data-phase={at.phase.kind}
        >
          <div
            className="breathe-circle"
            // 0.45→1 rather than 0→1: a circle that vanishes at the bottom of
            // the out-breath reads as an error, not as an empty chest.
            style={{ transform: `scale(${0.45 + scale * 0.55})` }}
            aria-hidden="true"
          />
          <div className="breathe-words">
            <span className="breathe-phase">{PHASE_WORDS[at.phase.kind]}</span>
            <span className="breathe-count">{running ? at.remaining : cycleSeconds(pattern)}</span>
          </div>
        </div>

        {/* Announced politely, so it still works with the screen off. */}
        <p className="visually-hidden" role="status" aria-live="polite">
          {running ? `${PHASE_WORDS[at.phase.kind]}, ${at.remaining}` : ''}
        </p>

        <p className="breathe-cycles">
          {running
            ? `${at.cycles} ${at.cycles === 1 ? 'round' : 'rounds'} so far`
            : 'However many feels like enough.'}
        </p>

        <div className="row">
          <button type="button" className="primary" onClick={() => setRunning(!running)}>
            {running ? 'Pause' : at.cycles || elapsed ? 'Carry on' : 'Start'}
          </button>
          {elapsed > 0 ? (
            <button type="button" className="chip" onClick={stop}>Stop</button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Patterns</h2>
        <p className="section-sub">
          Every one of these breathes out for at least as long as it breathes in.
          That is the part that does the work.
        </p>
        <div className="chips" role="radiogroup" aria-label="Pattern">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={pattern.id === p.id}
              className={`chip ${pattern.id === p.id ? 'chip-on' : ''}`}
              onClick={() => choose(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Whether the device has asked for less movement.
 *
 * Subscribed rather than read once: the setting can change while the app is
 * open, and on this screen in particular the change should take effect
 * immediately rather than at the next navigation.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
