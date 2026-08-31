import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, putMood } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { DEFAULT_TIMEZONE, type MoodEntry } from '../../domain/types';
import { Meter } from '../../components/Meter';
import {
  MOOD_MAX,
  MOOD_METERS,
  MOOD_MIN,
  NEUTRAL_MOOD,
  PARTNER_FALLBACK_NAME,
  comparisonLine,
  longDay,
  moodChanged,
  moodSummary,
  scaleWord,
  valuesOf,
  type MoodKey,
  type MoodValues,
} from './mood';

/**
 * Three meters a day, each, side by side.
 *
 * The columns are the screen. They are vertical because the question this page
 * answers is "how are we both doing", and two sets of columns compare at a
 * glance in a way two stacked bars do not. Everything below them is the way to
 * fill them in, and there is deliberately only one thing to do here.
 *
 * A day nobody has logged shows a dash — not a zero, and not a middling five.
 * The sliders sit in the middle so there is somewhere to start, but until one
 * is touched the draft is null and the column stays honest. Saving is explicit
 * for the same reason: opening this page must never be what writes a mood.
 */
export function MoodPage() {
  const settings = useLiveQuery(loadSettings, []);
  const [identity, setIdentity] = useState<{ memberId: string } | null>(null);

  const timeZone = settings?.timeZone ?? DEFAULT_TIMEZONE;
  const day = todayKey(timeZone);
  const memberId = settings?.memberId ?? identity?.memberId ?? null;

  // The app has to work on the first phone before there is a second one, so an
  // id is minted locally rather than waited on. See ensureIdentity.
  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Wrapped in an object so "still loading" and "no row today" stay
  // distinguishable — useLiveQuery gives undefined for both, and telling them
  // apart is what stops a fast tap on Save from overwriting a real day with
  // the defaults before it has been read.
  const mineQuery = useLiveQuery(
    async (): Promise<{ row: MoodEntry | undefined }> => {
      if (!memberId) return { row: undefined };
      return { row: await db.moods.where('[memberId+day]').equals([memberId, day]).first() };
    },
    [memberId, day],
  );

  // The partner's row is simply today's row that is not mine. There is nowhere
  // yet that stores a second memberId, and making somewhere is Settings' job.
  const theirRow = useLiveQuery(
    async (): Promise<MoodEntry | undefined> => {
      if (!memberId) return undefined;
      const rows = await db.moods.where('day').equals(day).toArray();
      return rows.find((row) => row.memberId !== memberId);
    },
    [memberId, day],
  );

  const [draft, setDraft] = useState<MoodValues | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A new day — or a new identity after pairing — is a different row, so
  // anything half-set against the old one is dropped rather than carried over.
  useEffect(() => {
    setDraft(null);
    setNote(null);
  }, [day, memberId]);

  const ready = settings !== undefined && mineQuery !== undefined;
  const mineRow = mineQuery?.row;
  const shown = draft ?? valuesOf(mineRow);
  const theirs = valuesOf(theirRow);

  const paired = Boolean(settings?.coupleId && settings?.workerSecret);
  const showPartner = paired || Boolean(theirRow);
  const partnerName = PARTNER_FALLBACK_NAME;

  const metersChanged = moodChanged(mineRow, draft, null);
  const changed = moodChanged(mineRow, draft, note);
  // With no row yet, the middle of every scale is still a real answer about the
  // day, so it can be saved without moving anything first.
  const canSave = ready && (changed || !mineRow);
  const noteValue = note ?? mineRow?.note ?? '';
  const gapLine = comparisonLine(shown, theirs);

  const setMeter = (key: MoodKey, value: number) => {
    setDraft({ ...(shown ?? NEUTRAL_MOOD), [key]: value });
  };

  const save = async () => {
    setSaving(true);
    try {
      const { memberId: writeTo } = await ensureIdentity();
      const trimmed = noteValue.trim();
      await putMood(writeTo, day, {
        ...(shown ?? NEUTRAL_MOOD),
        note: trimmed || undefined,
      });
      setDraft(null);
      setNote(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Mood</h1>
        <p className="page-sub">Three meters a day, for each of you.</p>
      </header>

      <section className="mood-summary">
        <p className="mood-day">{longDay(day)}</p>
        <p className="mood-lead">{moodSummary(shown, theirs, { paired, partnerName })}</p>
        {gapLine ? <p className="mood-sub">{gapLine}</p> : null}
      </section>

      <section className="mood-compare" data-paired={showPartner ? 'true' : 'false'}>
        <MoodColumn who="You" values={shown} unsaved={metersChanged} />
        {showPartner ? (
          <MoodColumn who={partnerName} values={theirs} unsaved={false} />
        ) : (
          <div className="mood-invite">
            <p className="mood-invite-lead">No second column yet.</p>
            <p className="mood-invite-sub">
              Pair the two phones in <Link to="/settings">Settings</Link> and their
              meters stand beside yours.
            </p>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">How is today?</h2>
        <p className="section-sub">
          Drag each one to where the day actually is. Nothing here goes down on its own.
        </p>

        {MOOD_METERS.map((meter) => {
          const value = shown?.[meter.key] ?? NEUTRAL_MOOD[meter.key];
          return (
            <div className="mood-set" key={meter.key}>
              <div className="mood-set-head">
                <label className="mood-set-label" htmlFor={`mood-${meter.key}`}>
                  {meter.label}
                </label>
                <span className="mood-set-word" data-set={shown ? 'true' : 'false'}>
                  {shown ? scaleWord(meter.key, value) : 'Not set'}
                </span>
              </div>
              <input
                className="mood-slider"
                id={`mood-${meter.key}`}
                type="range"
                min={MOOD_MIN}
                max={MOOD_MAX}
                step={1}
                value={value}
                onChange={(e) => setMeter(meter.key, Number(e.target.value))}
              />
              <div className="mood-set-ends">
                <span>{meter.low}</span>
                <span>{meter.high}</span>
              </div>
            </div>
          );
        })}

        <div className="mood-set">
          <label className="mood-set-label" htmlFor="mood-note">Note</label>
          <textarea
            className="field mood-note"
            id="mood-note"
            rows={2}
            placeholder="Anything worth remembering about today?"
            value={noteValue}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <button className="primary" type="button" onClick={save} disabled={!canSave || saving}>
          {canSave || !ready ? 'Save today' : 'Saved'}
        </button>
      </section>
    </div>
  );
}

interface MoodColumnProps {
  who: string;
  values: MoodValues | null;
  /** Mine, mid-edit: the column is showing a draft, so it says so. */
  unsaved: boolean;
}

function columnState(values: MoodValues | null, unsaved: boolean): string {
  if (!values) return 'Not logged yet';
  return unsaved ? 'Not saved yet' : 'Logged';
}

function MoodColumn({ who, values, unsaved }: MoodColumnProps) {
  return (
    <div className="mood-column" role="group" aria-label={who} data-unsaved={unsaved ? 'true' : 'false'}>
      <p className="mood-who">{who}</p>
      <div className="mood-meters">
        {MOOD_METERS.map((meter) => (
          <Meter
            key={meter.key}
            label={meter.label}
            value={values ? values[meter.key] : null}
            valueText={values ? scaleWord(meter.key, values[meter.key]) : undefined}
          />
        ))}
      </div>
      <p className="mood-state">{columnState(values, unsaved)}</p>
    </div>
  );
}
