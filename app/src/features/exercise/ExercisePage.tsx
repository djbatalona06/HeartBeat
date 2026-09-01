import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, putExercise } from '../../db/repository';
import { addDays, todayKey } from '../../domain/day';
import { DEFAULT_TIMEZONE, type DayKey } from '../../domain/types';
import { CameraCapture } from './CameraCapture';
import {
  CAPTION_MAX, NAME_MAX, blankRow, cleanCaption, isWorthSaving, summarise, toRows, toSets,
  type SetRow,
} from './workout';

/**
 * The Move screen: what you did, in your own words, with proof.
 *
 * Three things, in the order a person does them — the sets, a line about the
 * session, and the photographs. Nothing on this page scores you, ranks you
 * against yesterday or goes red when a day is empty; an empty day here says
 * "Nothing logged yet" and stops talking.
 *
 * Photographs are written to their own table rather than onto the entry. The
 * reason is in `repository.ts`: the sync payload has a cap in kilobytes, and a
 * photograph on the entry row would wedge every other kind of entry along with
 * it.
 */

/** "Saturday 29 August", the way a calendar names a day. */
function longDay(day: DayKey): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function ExercisePage() {
  const settings = useLiveQuery(loadSettings, []);
  const timeZone = settings?.timeZone ?? DEFAULT_TIMEZONE;
  const today = todayKey(timeZone);

  const [memberId, setMemberId] = useState<string | null>(null);
  const [day, setDay] = useState<DayKey>(today);

  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setMemberId(next.memberId); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // An array rather than .first(): undefined then means "still loading" rather
  // than "no such day", and the two must not hydrate the form the same way.
  const entries = useLiveQuery(
    async () => (memberId ? db.exercises.where('[memberId+day]').equals([memberId, day]).toArray() : []),
    [memberId, day],
  );
  const entry = entries?.[0];

  const photos = useLiveQuery(
    async () => (memberId ? db.workoutPhotos.where('[memberId+day]').equals([memberId, day]).toArray() : []),
    [memberId, day],
  ) ?? [];

  const [rows, setRows] = useState<SetRow[]>(() => [blankRow()]);
  const [caption, setCaption] = useState('');
  const [saved, setSaved] = useState(false);
  // Which (member, day) the form currently holds. Without it every live-query
  // tick would overwrite whatever is half-typed in the grid.
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    if (!memberId || entries === undefined) return;
    const key = `${memberId}:${day}`;
    if (loaded.current === key) return;
    loaded.current = key;
    const stored = toRows(entry?.sets);
    setRows(stored.length > 0 ? stored : [blankRow()]);
    setCaption(entry?.caption ?? '');
    setSaved(false);
  }, [memberId, day, entries, entry]);

  const sets = useMemo(() => toSets(rows), [rows]);

  function patch(id: string, field: keyof Omit<SetRow, 'id'>, value: string) {
    setSaved(false);
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setSaved(false);
    setRows((current) => [...current, blankRow()]);
  }

  function removeRow(id: string) {
    setSaved(false);
    // The grid always keeps one row: an empty page with no way back into it is
    // a dead end, not a clean slate.
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : [blankRow()]));
  }

  async function save() {
    if (!memberId) return;
    await putExercise(memberId, day, {
      sets,
      caption: cleanCaption(caption),
      // Carried through untouched. These two fields belong to another unit, and
      // saving the grid must not quietly drop what it put there.
      proofFront: entry?.proofFront,
      proofBack: entry?.proofBack,
    });
    setSaved(true);
  }

  const canSave = Boolean(memberId) && (isWorthSaving(rows, caption) || entry !== undefined);
  const front = photos.find((p) => p.facing === 'front');
  const back = photos.find((p) => p.facing === 'back');

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Move</h1>
        <p className="page-sub">What you did today, and what it looked like.</p>
      </header>

      <div className="ex-days">
        <button
          type="button"
          className="ex-day-step"
          onClick={() => setDay(addDays(day, -1))}
          aria-label="The day before"
        >
          ‹
        </button>
        <span className="ex-day">{day === today ? 'Today' : longDay(day)}</span>
        <button
          type="button"
          className="ex-day-step"
          onClick={() => setDay(addDays(day, 1))}
          disabled={day >= today}
          aria-label="The day after"
        >
          ›
        </button>
      </div>

      <section className="sheet">
        <h2 className="section-title">The sets</h2>
        <p className="section-sub">One line per set. Leave the weight blank for bodyweight.</p>

        <ul className="set-list">
          {rows.map((row, index) => (
            <li className="set-row" key={row.id}>
              <input
                className="field set-name"
                value={row.name}
                maxLength={NAME_MAX}
                placeholder={index === 0 ? 'Back squat' : 'Exercise'}
                aria-label={`Exercise, set ${index + 1}`}
                onChange={(e) => patch(row.id, 'name', e.target.value)}
              />
              <div className="set-numbers">
                <label className="set-num">
                  <span className="set-num-label">Reps</span>
                  <input
                    className="field"
                    value={row.reps}
                    inputMode="numeric"
                    placeholder="0"
                    onChange={(e) => patch(row.id, 'reps', e.target.value)}
                  />
                </label>
                <label className="set-num">
                  <span className="set-num-label">Kg</span>
                  <input
                    className="field"
                    value={row.weight}
                    inputMode="decimal"
                    placeholder="—"
                    onChange={(e) => patch(row.id, 'weight', e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="set-remove"
                  onClick={() => removeRow(row.id)}
                  aria-label={`Remove set ${index + 1}`}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>

        <button type="button" className="quiet" onClick={addRow}>Add a set</button>
        <p className="set-total">{summarise(sets)}</p>
      </section>

      <section className="sheet">
        <h2 className="section-title">How it went</h2>
        <p className="section-sub">A line for future you.</p>
        <textarea
          className="field ex-caption"
          value={caption}
          rows={2}
          maxLength={CAPTION_MAX}
          placeholder="Heavy, but it moved."
          aria-label="Workout caption"
          onChange={(e) => { setSaved(false); setCaption(e.target.value); }}
        />
      </section>

      <section className="sheet">
        <h2 className="section-title">Proof</h2>
        <p className="section-sub">
          Two photos, kept on this phone. Each one is shrunk before it is stored.
        </p>
        {memberId ? (
          <div className="proof-grid">
            <CameraCapture memberId={memberId} day={day} facing="back" photo={back} />
            <CameraCapture memberId={memberId} day={day} facing="front" photo={front} />
          </div>
        ) : null}
      </section>

      <button type="button" className="primary" onClick={() => { void save(); }} disabled={!canSave}>
        {saved ? 'Saved' : 'Save the day'}
      </button>
    </div>
  );
}
