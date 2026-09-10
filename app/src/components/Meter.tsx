import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface MeterProps {
  label: string;
  value: number | null;
  max?: number;
  /**
   * What the number means in words — "Bright", "Frayed". Read out in place of
   * the digit, because on a 1-10 scale the digit alone does not say which end
   * is the good one.
   */
  valueText?: string;
  /**
   * Present only on a column that may be edited — the partner's column never
   * receives this, and stays the plain read-only meter it always was. Where
   * it is given, the meter becomes the input: drag or arrow-key the fill
   * itself rather than a separate slider underneath repeating the same value.
   */
  onChange?: (value: number) => void;
}

const MIN = 1;

/**
 * A vertical 1-10 meter. Reads as a column filling from the bottom, which is
 * easier to compare side by side across two people than a row of numbers.
 *
 * The fill is `value / max` rather than a position on the 1-10 scale, so the
 * lowest value keeps a visible sliver: an empty track means nothing logged,
 * and a 1 is a thing somebody said.
 *
 * Without `onChange` this is exactly the read-only meter it always was. With
 * it, the track itself becomes `role="slider"` — drag it, or focus it and use
 * the arrow keys, Home, and End. There used to be a second, separate slider
 * below the display column doing the same job with the same value twice.
 */
export function Meter({ label, value, max = 10, valueText, onChange }: MeterProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggable = Boolean(onChange);
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max)) * 100;

  const setFromClientY = useCallback((clientY: number) => {
    if (!onChange || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.height <= 0) return;
    // The track fills from the bottom, so the bottom edge is MIN and the top
    // edge is `max` — a pointer above the track clamps to max, below to MIN.
    const fraction = 1 - (clientY - rect.top) / rect.height;
    const raw = MIN + fraction * (max - MIN);
    onChange(Math.round(Math.max(MIN, Math.min(max, raw))));
  }, [onChange, max]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!onChange) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromClientY(event.clientY);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    // Buttons is 0 once the pointer is released, even without an explicit up
    // handler — checking it here is what lets pointer capture stand in for
    // one, instead of a document-level listener this component would have to
    // remember to remove.
    if (!onChange || event.buttons !== 1) return;
    setFromClientY(event.clientY);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onChange) return;
    const current = value ?? Math.round((MIN + max) / 2);
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      onChange(Math.min(max, current + 1));
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      onChange(Math.max(MIN, current - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(MIN);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(max);
    }
  };

  return (
    <div className="meter">
      <div
        ref={trackRef}
        className="meter-track"
        data-draggable={draggable ? 'true' : 'false'}
        role={draggable ? 'slider' : 'meter'}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value == null ? 'Not logged' : valueText}
        aria-valuemin={MIN}
        aria-valuemax={max}
        aria-label={label}
        tabIndex={draggable ? 0 : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <div className="meter-fill" style={{ height: `${pct}%` }} />
      </div>
      <div className="meter-value">{value ?? '–'}</div>
      <div className="meter-label">{label}</div>
    </div>
  );
}
