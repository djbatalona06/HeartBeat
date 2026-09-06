import { useMemo, useState } from 'react';
import { addDays, dayKey } from '../domain/day';
import {
  monthGrid,
  presetsFor,
  shiftMonth,
  slotsFor,
} from '../domain/schedule/presets';

/**
 * Pick a moment: quick presets over a month, with the times for the chosen day
 * beside it.
 *
 * This is the *Scheduling 4* block from React Bits Pro, built here rather than
 * installed. The registry it lives in is a paid namespace this repo has no key
 * for, and pulling it in would have meant `shadcn init` — Tailwind, `cn()`,
 * class-variance-authority, tailwind-merge, Radix and a path alias — grafted
 * onto a 2353-line hand-written stylesheet whose every value is a custom
 * property written at runtime by the theme engine. Two styling systems for one
 * component is a worse trade than writing the component.
 *
 * All the arithmetic is in `domain/schedule/presets.ts` and tested there,
 * including both daylight-saving boundaries. What is left here is the DOM.
 */

interface DeadlinePickerProps {
  /** The member's own zone. Every day boundary in this app is computed in it. */
  timeZone: string;
  value: number | null;
  onChange: (at: number | null) => void;
  /** Overridable so the picker can be driven from a test or a story. */
  now?: number;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function timeLabel(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' })
    .format(new Date(at));
}

export function DeadlinePicker({ timeZone, value, onChange, now = Date.now() }: DeadlinePickerProps) {
  const today = dayKey(new Date(now), timeZone);
  const [month, setMonth] = useState(() => (value ? dayKey(new Date(value), timeZone) : today));
  const [day, setDay] = useState<string>(() => (value ? dayKey(new Date(value), timeZone) : today));

  const presets = useMemo(() => presetsFor(now, timeZone), [now, timeZone]);
  const cells = useMemo(() => monthGrid(month), [month]);
  const slots = useMemo(() => slotsFor(day, now, timeZone), [day, now, timeZone]);

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}T12:00:00Z`));

  function pickPreset(at: number | null) {
    if (at === null) return;
    onChange(at);
    const key = dayKey(new Date(at), timeZone);
    setDay(key);
    setMonth(key);
  }

  return (
    <div className="deadline">
      {/* The presets are the fast path and most choices end here. The calendar
          below is for the ones that do not. */}
      <div className="deadline-presets" role="group" aria-label="Quick times">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="deadline-preset"
            // Kept in place rather than removed once its moment passes: a row
            // that changes length through the day is harder to use.
            disabled={preset.at === null}
            aria-pressed={preset.at !== null && preset.at === value}
            onClick={() => pickPreset(preset.at)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="deadline-body">
        <div className="deadline-month">
          <div className="deadline-month-head">
            <button
              type="button"
              className="deadline-step"
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="deadline-month-label" aria-live="polite">{monthLabel}</span>
            <button
              type="button"
              className="deadline-step"
              onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="deadline-grid" role="grid">
            {WEEKDAYS.map((initial, i) => (
              // Duplicated initials (T, T and S, S) would be read out twice by
              // a screen reader as the same thing, so the key carries position.
              <span key={`${initial}-${i}`} className="deadline-weekday" aria-hidden="true">
                {initial}
              </span>
            ))}
            {cells.map((cell, i) =>
              cell === null ? (
                <span key={`pad-${i}`} className="deadline-pad" aria-hidden="true" />
              ) : (
                <button
                  key={cell}
                  type="button"
                  className="deadline-day"
                  // A day already over has no times to offer, so it cannot be
                  // chosen — the empty column would be the only feedback.
                  disabled={cell < today}
                  data-today={cell === today || undefined}
                  data-chosen={cell === day || undefined}
                  aria-label={cell}
                  aria-current={cell === today ? 'date' : undefined}
                  onClick={() => setDay(cell)}
                >
                  {Number(cell.slice(8))}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="deadline-slots" role="listbox" aria-label="Times">
          {slots.length === 0 ? (
            <p className="deadline-empty">
              Nothing left today.{' '}
              <button type="button" className="deadline-link" onClick={() => setDay(addDays(today, 1))}>
                Try tomorrow
              </button>
            </p>
          ) : (
            slots.map((at) => (
              <button
                key={at}
                type="button"
                role="option"
                className="deadline-slot"
                aria-selected={at === value}
                data-chosen={at === value || undefined}
                onClick={() => onChange(at)}
              >
                {timeLabel(at, timeZone)}
              </button>
            ))
          )}
        </div>
      </div>

      {value ? (
        <p className="deadline-chosen">
          {new Intl.DateTimeFormat(undefined, {
            timeZone,
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(value))}
          <button type="button" className="deadline-link" onClick={() => onChange(null)}>
            Clear
          </button>
        </p>
      ) : null}
    </div>
  );
}
