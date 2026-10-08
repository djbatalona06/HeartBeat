import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, putMood } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { isPaired } from '../../domain/identity/rekey';
import { DEFAULT_TIMEZONE, type MoodEntry, type Settings } from '../../domain/types';
import { Meter } from '../../components/Meter';
import { Chip } from '../../ui/Chip';
import { ComplimentComposer } from './ComplimentComposer';
import { CycleSection } from '../cycle/CyclePage';
import { MoodTrends } from './MoodTrends';
import { WellnessNote } from './WellnessNote';
import {
  MOOD_FLAGS,
  MOOD_METERS,
  NEUTRAL_MOOD,
  flagsChanged,
  flagsOf,
  type MoodFlags,
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
import { PageTitle } from '../../ui/layout/PageTitle';
import { GUIDES } from '../guide/guides';
import { PushOffer } from '../settings/PushOffer';

/**
 * Three meters a day, each, side by side.
 *
 * The columns are the screen. They are vertical because the question this page
 * answers is "how are we both doing", and two sets of columns compare at a
 * glance in a way two stacked bars do not.
 *
 * The meter is the input now — drag it, or focus it and use the arrow keys —
 * rather than a display column with a second, separate slider repeating the
 * same value underneath. A day nobody has logged shows a dash and an empty
 * track, never a zero and never a hidden default: the first touch lands the
 * value wherever it actually lands, rather than jumping from a pre-set five.
 * Saving stays explicit, for the reason it always was: opening this page must
 * never be what writes a mood.
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

  const { mineQuery, theirRow } = useTodayMoods(memberId, day);

  const {
    draft, setDraft, note, setNote, flags, setFlags, saving, setSaving, reset,
  } = useMoodDraft(day, memberId);

  const {
    ready, shown, theirs, paired, showPartner, partnerName, metersChanged,
    shownFlags, canSave, noteValue, gapLine,
  } = moodView({ settings, mineQuery, theirRow, draft, note, flags });

  const setMeter = (key: MoodKey, value: number) => {
    setDraft({ ...(shown ?? NEUTRAL_MOOD), [key]: value });
  };

  // Set by a save, for the notifications offer that rides on it.
  const [logged, setLogged] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { memberId: writeTo } = await ensureIdentity();
      const trimmed = noteValue.trim();
      // The whole row is written, so the flags go with every save — a meter
      // nudged after ticking "Rested" must not quietly untick it.
      await putMood(writeTo, day, {
        ...(shown ?? NEUTRAL_MOOD),
        note: trimmed || undefined,
        ...shownFlags,
      });
      reset();
      setLogged(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <PageTitle guide={GUIDES.mood}>Mood</PageTitle>
        <p className="page-sub">Drag a meter to where today actually is. The cycle log is below.</p>
      </header>

      <section className="mood-summary">
        <p className="mood-day">{longDay(day)}</p>
        <p className="mood-lead">{moodSummary(shown, theirs, { paired, partnerName })}</p>
        {gapLine ? <p className="mood-sub">{gapLine}</p> : null}
      </section>

      <MoodCompare
        shown={shown}
        theirs={theirs}
        unsaved={metersChanged}
        showPartner={showPartner}
        partnerName={partnerName}
        onChange={setMeter}
      />

      {/* Straight after the meters, because that is where the save happened. */}
      <PushOffer settings={settings} justWon={logged} />

      {/* Below the meters rather than above them: the day's own numbers are
          what this page is for, and a compliment is what you do once you have
          seen them. Only once there are two of you — there is nobody to send to
          otherwise. */}
      {paired ? (
        <ComplimentComposer
          token={settings?.workerSecret}
          timeZone={timeZone}
          today={day}
          tone={settings?.complimentTone ?? 'tender'}
          petName={settings?.complimentPetName}
          blocked={settings?.complimentBlocked}
        />
      ) : null}

      <AddPanel
        flags={shownFlags}
        onFlags={setFlags}
        note={noteValue}
        onNote={setNote}
        canSave={canSave}
        ready={ready}
        saving={saving}
        onSave={save}
      />

      {/* After today's panel, because today is what this page is for; the
          last week or month is what you read once today is down. */}
      <MoodTrends memberId={memberId} today={day} partnerName={partnerName} paired={paired} />

      {/* One line for today, above the lock and therefore never a cycle one --
          `openLanes` is what enforces that, not this call site. */}
      <WellnessNote placement="open" />

      {/* Last, and gated on its own.

          Last because the three meters are what this page is for and the cycle
          log is the longer, more deliberate thing you scroll to. Gated on its
          own because it can carry a PIN, and that PIN re-locks every time the
          app leaves the foreground -- if the gate reached the whole page,
          logging your own mood would blank the screen every time you glanced
          at a notification. See CycleLock. */}
      <CycleSection />
    </div>
  );
}

interface MoodViewInput {
  settings: Settings | undefined;
  mineQuery: { row: MoodEntry | undefined } | undefined;
  theirRow: MoodEntry | undefined;
  draft: MoodValues | null;
  note: string | null;
  flags: MoodFlags | null;
}

/** What the page shows and whether Save is live, worked out from what is stored and what is half-typed. */
function moodView({ settings, mineQuery, theirRow, draft, note, flags }: MoodViewInput) {
  const ready = settings !== undefined && mineQuery !== undefined;
  const mineRow = mineQuery?.row;
  const shown = draft ?? valuesOf(mineRow);
  const theirs = valuesOf(theirRow);

  // One definition, shared with every other screen that asks — see `isPaired`.
  const paired = isPaired(settings);
  const changed = moodChanged(mineRow, draft, note) || flagsChanged(mineRow, flags);
  return {
    ready,
    mineRow,
    shown,
    theirs,
    paired,
    showPartner: paired || Boolean(theirRow),
    partnerName: PARTNER_FALLBACK_NAME,
    metersChanged: moodChanged(mineRow, draft, null),
    shownFlags: flags ?? flagsOf(mineRow),
    // With no row yet, the middle of every scale is still a real answer about
    // the day, so it can be saved without moving anything first.
    canSave: ready && (changed || !mineRow),
    noteValue: note ?? mineRow?.note ?? '',
    gapLine: comparisonLine(shown, theirs),
  };
}

/**
 * Mine and theirs for one day.
 *
 * Mine is wrapped in an object so "still loading" and "no row today" stay
 * distinguishable — useLiveQuery gives undefined for both, and telling them
 * apart is what stops a fast tap on Save from overwriting a real day with the
 * defaults before it has been read. The partner's is simply today's row that is
 * not mine: there is nowhere yet that stores a second memberId, and making
 * somewhere is Settings' job.
 */
function useTodayMoods(memberId: string | null, day: string) {
  const mineQuery = useLiveQuery(
    async (): Promise<{ row: MoodEntry | undefined }> => {
      if (!memberId) return { row: undefined };
      return { row: await db.moods.where('[memberId+day]').equals([memberId, day]).first() };
    },
    [memberId, day],
  );
  const theirRow = useLiveQuery(
    async (): Promise<MoodEntry | undefined> => {
      if (!memberId) return undefined;
      const rows = await db.moods.where('day').equals(day).toArray();
      return rows.find((row) => row.memberId !== memberId);
    },
    [memberId, day],
  );
  return { mineQuery, theirRow };
}

/**
 * What has been touched but not saved. A new day — or a new identity after
 * pairing — is a different row, so anything half-set against the old one is
 * dropped rather than carried over.
 */
function useMoodDraft(day: string, memberId: string | null) {
  const key = `${day}|${memberId ?? ''}`;
  const blank = { key, draft: null, note: null, flags: null };
  const [edits, setEdits] = useState<MoodEdits>(blank);
  const [saving, setSaving] = useState(false);

  // Edits carry the day and identity they were made against. Read against any
  // other, they are simply absent, so no effect has to clear them afterwards.
  const current = edits.key === key ? edits : blank;
  const patch = (change: Partial<MoodEdits>) =>
    setEdits((prev) => ({ ...(prev.key === key ? prev : blank), ...change }));

  return {
    draft: current.draft,
    setDraft: (draft: MoodValues | null) => patch({ draft }),
    note: current.note,
    setNote: (note: string | null) => patch({ note }),
    flags: current.flags,
    setFlags: (flags: MoodFlags | null) => patch({ flags }),
    saving,
    setSaving,
    reset: () => patch({ draft: null, note: null, flags: null }),
  };
}

interface MoodEdits {
  key: string;
  draft: MoodValues | null;
  note: string | null;
  flags: MoodFlags | null;
}

interface MoodColumnProps {
  who: string;
  values: MoodValues | null;
  /** Mine, mid-edit: the column is showing a draft, so it says so. */
  unsaved: boolean;
  /** Present only for the editable column — the partner's stays read-only. */
  onChange?: (key: MoodKey, value: number) => void;
}

function columnState(values: MoodValues | null, unsaved: boolean): string {
  if (!values) return 'Not logged yet';
  return unsaved ? 'Not saved yet' : 'Logged';
}

function MoodColumn({ who, values, unsaved, onChange }: MoodColumnProps) {
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
            onChange={onChange ? (value) => onChange(meter.key, value) : undefined}
          />
        ))}
      </div>
      <p className="mood-state">{columnState(values, unsaved)}</p>
    </div>
  );
}

interface MoodCompareProps {
  shown: MoodValues | null;
  theirs: MoodValues | null;
  unsaved: boolean;
  showPartner: boolean;
  partnerName: string;
  onChange: (key: MoodKey, value: number) => void;
}

/** Your column, and either theirs or the invitation to make theirs appear. */
function MoodCompare({ shown, theirs, unsaved, showPartner, partnerName, onChange }: MoodCompareProps) {
  return (
    <section className="mood-compare" data-paired={showPartner ? 'true' : 'false'}>
      <MoodColumn who="You" values={shown} unsaved={unsaved} onChange={onChange} />
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
  );
}

interface AddPanelProps {
  flags: MoodFlags;
  onFlags: (flags: MoodFlags) => void;
  note: string;
  onNote: (note: string) => void;
  canSave: boolean;
  ready: boolean;
  saving: boolean;
  onSave: () => void;
}

/** The flags, the note, and the explicit Save: opening the page must never write a mood. */
function AddPanel({ flags, onFlags, note, onNote, canSave, ready, saving, onSave }: AddPanelProps) {
  return (
    <section className="panel">
      <h2 className="section-title">Anything to add?</h2>
      <p className="section-sub">Nothing here goes down on its own.</p>

      <div className="mood-set">
        <span className="mood-set-label" id="mood-flags-label">Today I was</span>
        <div className="mood-flags" role="group" aria-labelledby="mood-flags-label">
          {MOOD_FLAGS.map(({ key, label }) => (
            <Chip
              key={key}
              on={Boolean(flags[key])}
              onClick={() => onFlags({ ...flags, [key]: !flags[key] })}
            >
              {label}
            </Chip>
          ))}
        </div>
        <p className="section-sub">These charge your moves in Eve&rsquo;s Garden.</p>
      </div>

      <div className="mood-set">
        <label className="mood-set-label" htmlFor="mood-note">Note</label>
        <textarea
          className="field mood-note"
          id="mood-note"
          rows={2}
          placeholder="Anything worth remembering about today?"
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
      </div>

      <button className="primary" type="button" onClick={onSave} disabled={!canSave || saving}>
        {canSave || !ready ? 'Save today' : 'Saved'}
      </button>
    </section>
  );
}
