import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, putExercise } from '../../db/repository';
import { addDays, startOfWeek, todayKey } from '../../domain/day';
import { DEFAULT_TIMEZONE, type DayKey } from '../../domain/types';
import { CameraCapture } from './CameraCapture';
import { WeekThread } from './WeekThread';
import { PhotoWall } from './PhotoWall';
import {
  CAPTION_MAX, NAME_MAX, blankRow, cleanCaption, isWorthSaving, summarise, toRows, toSets,
  type SetRow,
} from './workout';
import { SecondaryAction } from '../../ui/SecondaryAction';
import { postMoveNudge } from '../../pwa/api';

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

    // Tell the other phone, and never let that fail this. The sets are already
    // written above; a notification that did not go out is not a reason to
    // report the save as broken.
    //
    // Only when there is something to announce: saving an emptied day is how
    // somebody deletes a workout, and "they moved today" is the wrong thing to
    // send about that. Re-saving is free either way -- the endpoint keys the
    // row by couple, day and recipient and does nothing on conflict, so the
    // other phone is told once however many times this runs.
    const token = settings?.workerSecret;
    if (token && sets.length > 0) void postMoveNudge(token, day).catch(() => {});
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

      {/* The week, then which day of it. The arrows moved one day at a time
          and said nothing about the other six, which on a screen whose whole
          subject is consistency was the wrong thing to show. They are still
          here, either side, because a week strip cannot reach last Tuesday. */}
      <div className="ex-days">
        <button
          type="button"
          className="ex-day-step"
          onClick={() => setDay(addDays(day, -7))}
          aria-label="The week before"
        >
          ‹
        </button>
        <span className="ex-day">{day === today ? 'Today' : longDay(day)}</span>
        <button
          type="button"
          className="ex-day-step"
          // Clamped to today rather than landing a week ahead: stepping forward
          // from a Wednesday in a past week would otherwise select a Wednesday
          // that has not happened, and the form would offer to log it.
          onClick={() => { const next = addDays(day, 7); setDay(next > today ? today : next); }}
          disabled={startOfWeek(day) >= startOfWeek(today)}
          aria-label="The week after"
        >
          ›
        </button>
      </div>

      <WeekThread memberId={memberId} day={day} today={today} onPick={setDay} />

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

        <SecondaryAction onClick={addRow}>Add a set</SecondaryAction>
        <p className="set-total">{summarise(sets)}</p>
        {/* Straight to the month, rather than leaving somebody to find the
            Work tab and work out that it also holds this. The calendar marks
            every day with sets on it and shows this same line in its day
            sheet, so it is genuinely the same information one level up. */}
        <p className="section-sub">
          <Link className="ex-calendar-link" to="/work">See the month on the calendar</Link>
        </p>
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

      {/* After the save button, because it looks back rather than asking for
          anything -- the same order home puts its feed in. The week it shows is
          the one the strip above is on, so the arrows move both. */}
      <PhotoWall memberId={memberId} day={day} />
    </div>
  );
}
