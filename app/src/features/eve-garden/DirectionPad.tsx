import { useEffect, useId, useRef } from 'react';
import type { StepResult } from './scene/events';
import { DIRECTIONS, HOLD_REPEAT_MS, type Direction } from './dpad';
import { Icon } from '../../components/icons';

/**
 * A four-way pad over the garden, for a thumb that has no arrow keys.
 *
 * Tapping a tile beside the pet already walked it, but nothing on screen said
 * so. These are real buttons: Tab reaches them, Enter and Space step, and a
 * held press keeps walking until it lets go. The arrow keys stay with the
 * canvas — one owner per key.
 */
export interface DirectionPadProps {
  onStep(dx: number, dy: number): StepResult;
  /** Told what each step did, for haptics. */
  onResult?(result: StepResult): void;
}

export function DirectionPad({ onStep, onResult }: DirectionPadProps) {
  const timer = useRef<number | undefined>(undefined);
  const hint = useId();

  const stop = () => {
    window.clearInterval(timer.current);
    timer.current = undefined;
  };
  useEffect(() => stop, []);

  const walk = (d: Direction) => {
    const result = onStep(d.dx, d.dy);
    onResult?.(result);
    // A step that started a fight or hit a wall ends the hold: walking on
    // into a wall is a buzz a second, and into a fight is nonsense.
    if (result === 'blocked' || result === 'engaged') stop();
  };

  return (
    <div className="garden-dpad" role="group" aria-label="Walk" aria-describedby={hint}>
      {/* Was a paragraph under the garden; the page below the fight is gone,
          and the pad is where the question "how do I move?" gets asked. */}
      <p id={hint} className="visually-hidden">
        Arrow keys, WASD or these buttons walk, or tap a tile beside you. Walk
        into the monster to start a fight; walking away from one costs nothing.
      </p>
      {DIRECTIONS.map((d) => (
        <button
          key={d.key}
          type="button"
          className={`garden-dpad-${d.key}`}
          aria-label={d.label}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            stop();
            walk(d);
            timer.current = window.setInterval(() => walk(d), HOLD_REPEAT_MS);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onPointerLeave={stop}
          onBlur={stop}
          // Keyboard and switch access arrive as a click with no pointer
          // behind it; a pointer press already stepped on the way down.
          onClick={(event) => { if (event.detail === 0) walk(d); }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Icon name="arrow" turn={d.turn} />
        </button>
      ))}
    </div>
  );
}
