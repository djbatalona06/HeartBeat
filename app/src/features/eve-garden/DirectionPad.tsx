import { useEffect, useRef } from 'react';
import type { StepResult } from './scene/events';
import { DIRECTIONS, HOLD_REPEAT_MS, type Direction } from './dpad';

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
    <div className="garden-dpad" role="group" aria-label="Walk">
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
          <span aria-hidden="true">{d.glyph}</span>
        </button>
      ))}
    </div>
  );
}
