import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings, saveSettings } from '../../db/database';
import { ensureIdentity, putCycle } from '../../db/repository';
import { addDays, daysBetween, todayKey } from '../../domain/day';
import { DEFAULT_TIMEZONE, type CycleEntry, type DayKey } from '../../domain/types';
import { FLOWS, MOODS, SYMPTOM_GROUPS } from '../../domain/cycle/taxonomy';
import { daysLate, periodStartsFrom, predict, type Prediction } from '../../domain/cycle/predict';
import { CycleLock } from './CycleLock';
import { LockSettings } from './LockSettings';

/**
 * The cycle page.
 *
 * One person logs; both can see it. Which of the two you are is the first thing
 * this asks, because the page is a different thing in each case — a log, or a
 * window onto someone else's — and guessing wrong means showing the wrong one
 * to the wrong person.
 *
 * Every estimate on this page is advisory and says so. A fertile window is not
 * contraception, and the error bar is the honest part of the forecast.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthOf(day: DayKey): string {
  return day.slice(0, 7);
}

function weekdayOf(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInMonth(month: string): DayKey[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: count }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** "Saturday 29 August" — the calendar's own way of naming a day. */
function longDay(day: DayKey): string {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.toLocaleDateString('en-GB', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  });
}

function shortDay(day: DayKey): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short',
  });
}

export function CyclePage() {
  return (
    <CycleLock>
      <CycleBody />
    </CycleLock>
  );
}

function CycleBody() {
  const settings = useLiveQuery(loadSettings, []);
  const timeZone = settings?.timeZone ?? DEFAULT_TIMEZONE;
  const today = todayKey(timeZone);

  const [identity, setIdentity] = useState<{ memberId: string } | null>(null);
  const [month, setMonth] = useState<string>(monthOf(today));
  const [selected, setSelected] = useState<DayKey>(today);
  const [painting, setPainting] = useState(false);

  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const myId = identity?.memberId ?? null;
  const tracksCycle = settings?.tracksCycle;

  // Every row, not just this month's: the averages the forecast rests on need
  // the whole history, and a month's worth would shorten it to nothing.
  const all = useLiveQuery(async () => db.cycles.toArray(), []) ?? [];

  // Whose log this page is showing. Mine if I track; otherwise whoever else has
  // written rows, which after a sync is my partner.
  const subjectId = useMemo(() => {
    if (tracksCycle) return myId;
    const theirs = all.find((row) => row.memberId !== myId);
    return theirs?.memberId ?? null;
  }, [tracksCycle, myId, all]);

  const entries = useMemo(
    () => all.filter((row) => row.memberId === subjectId).sort((a, b) => a.day.localeCompare(b.day)),
    [all, subjectId],
  );

  const byDay = useMemo(() => {
    const map = new Map<DayKey, CycleEntry>();
    for (const e of entries) map.set(e.day, e);
    return map;
  }, [entries]);

  const prediction = useMemo(
    () => predict({ periodStarts: periodStartsFrom(entries), today }),
    [entries, today],
  );

  if (settings && tracksCycle === undefined) {
    return <TrackingQuestion />;
  }

  const days = daysInMonth(month);
  const lead = weekdayOf(days[0]);
  const [year, monthNumber] = month.split('-').map(Number);
  const canLog = Boolean(tracksCycle && myId);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Cycle</h1>
        <p className="page-sub">
          {canLog ? 'Yours to log. Both of you can see it.' : 'Theirs to log. You can see it.'}
        </p>
      </header>

      {subjectId ? (
        <Summary prediction={prediction} today={today} />
      ) : (
        <div className="empty">
          <p>Nothing logged yet.</p>
          <p className="empty-sub">
            Once there is a period start on the calendar, the forecast appears here.
          </p>
        </div>
      )}

      <div className="cal-head">
        <button
          type="button" className="cal-step"
          onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"
        >‹</button>
        <h2 className="cal-month">{MONTHS[monthNumber - 1]} {year}</h2>
        <button
          type="button" className="cal-step"
          onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"
        >›</button>
      </div>

      <div className="cal-grid" role="grid" aria-label="Month">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i} className="cal-weekday" aria-hidden="true">{initial}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} className="cal-blank" aria-hidden="true" />
        ))}
        {days.map((day) => {
          const entry = byDay.get(day);
          const marks = markingsFor(day, entry, prediction);
          return (
            <button
              key={day}
              type="button"
              className="cal-day"
              data-today={day === today ? 'true' : undefined}
              data-selected={day === selected ? 'true' : undefined}
              data-flow={entry?.flow ? 'true' : undefined}
              data-predicted={marks.predicted ? 'true' : undefined}
              data-fertile={marks.fertile ? 'true' : undefined}
              data-ovulation={marks.ovulation ? 'true' : undefined}
              aria-pressed={day === selected}
              aria-label={`${day}${marks.label ? `, ${marks.label}` : ''}`}
              onClick={() => {
                if (painting && canLog && myId) {
                  void togglePeriodDay(myId, day, entry);
                  return;
                }
                setSelected(day);
              }}
            >
              <span className="cal-num">{Number(day.slice(8, 10))}</span>
              {marks.dot ? <span className={`cycle-dot ${marks.dot}`} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <Legend />

      {canLog ? (
        <div className="cycle-actions">
          <button
            type="button"
            className={painting ? 'chip chip-on' : 'chip'}
            aria-pressed={painting}
            onClick={() => setPainting((on) => !on)}
          >
            {painting ? 'Done' : 'Edit period'}
          </button>
          {painting ? (
            <p className="cycle-hint">Tap any day to add or remove bleeding.</p>
          ) : null}
        </div>
      ) : null}

      {canLog && myId ? (
        <DaySheet key={selected} day={selected} memberId={myId} entry={byDay.get(selected)} />
      ) : (
        <ReadOnlyDay day={selected} entry={byDay.get(selected)} />
      )}

      <LockSettings />
    </div>
  );
}

/**
 * Painting a period day.
 *
 * Adding sets a medium flow — the commonest, and the one least likely to need
 * correcting. Removing clears the flow rather than deleting the row, because
 * the day may carry symptoms that have nothing to do with bleeding.
 */
async function togglePeriodDay(memberId: string, day: DayKey, entry?: CycleEntry): Promise<void> {
  const { id: _id, memberId: _m, day: _d, updatedAt: _u, ...rest } = entry ?? ({} as CycleEntry);
  await putCycle(memberId, day, entry?.flow ? { ...rest, flow: undefined } : { ...rest, flow: 'medium' });
}

interface Marks {
  predicted: boolean;
  fertile: boolean;
  ovulation: boolean;
  dot: string | null;
  label: string;
}

/**
 * What a day is wearing.
 *
 * Logged bleeding always wins over a prediction: what happened outranks what
 * was expected, and showing both on one day reads as a contradiction.
 */
function markingsFor(day: DayKey, entry: CycleEntry | undefined, p: Prediction): Marks {
  if (entry?.flow) {
    return { predicted: false, fertile: false, ovulation: false, dot: null, label: `${entry.flow} flow` };
  }

  const inWindow = (start: DayKey, end: DayKey) =>
    daysBetween(start, day) >= 0 && daysBetween(day, end) >= 0;

  if (p.nextPeriodStart) {
    const from = addDays(p.nextPeriodStart, -p.uncertaintyDays);
    const to = addDays(p.nextPeriodStart, p.uncertaintyDays);
    if (inWindow(from, to)) {
      return { predicted: true, fertile: false, ovulation: false, dot: null, label: 'period expected' };
    }
  }
  if (p.ovulationDate === day) {
    return { predicted: false, fertile: true, ovulation: true, dot: null, label: 'ovulation estimated' };
  }
  if (p.fertileWindow && inWindow(p.fertileWindow.start, p.fertileWindow.end)) {
    return { predicted: false, fertile: true, ovulation: false, dot: null, label: 'fertile window' };
  }
  if (entry?.checkInComplete || entry?.symptoms?.length || entry?.moods?.length || entry?.notes) {
    return { predicted: false, fertile: false, ovulation: false, dot: 'cycle-dot-logged', label: 'logged' };
  }
  return { predicted: false, fertile: false, ovulation: false, dot: null, label: '' };
}

function Legend() {
  return (
    <ul className="cycle-legend" aria-label="What the colours mean">
      <li><i className="cycle-key cycle-key-flow" aria-hidden="true" /> Bleeding</li>
      <li><i className="cycle-key cycle-key-predicted" aria-hidden="true" /> Period expected</li>
      <li><i className="cycle-key cycle-key-fertile" aria-hidden="true" /> Fertile window</li>
      <li><i className="cycle-key cycle-key-logged" aria-hidden="true" /> Logged</li>
    </ul>
  );
}

function Summary({ prediction, today }: { prediction: Prediction; today: DayKey }) {
  const p = prediction;

  if (p.source === 'insufficient-data' || p.source === 'stale-history') {
    return (
      <section className="cycle-summary">
        <p className="cycle-summary-lead">
          {p.cycleDay ? `Day ${p.cycleDay}` : 'No forecast yet'}
        </p>
        <p className="cycle-summary-sub">
          {p.source === 'stale-history'
            ? 'The last period logged here was months ago, so there is nothing recent enough to forecast from.'
            : 'Two period starts are enough to begin. Mark them on the calendar and a forecast appears.'}
        </p>
      </section>
    );
  }

  const late = daysLate(p, today);
  const until = p.nextPeriodStart ? daysBetween(today, p.nextPeriodStart) : null;

  return (
    <section className="cycle-summary">
      <p className="cycle-summary-lead">
        {late > 0
          ? `${late} day${late > 1 ? 's' : ''} late`
          : until === 0
            ? 'Period expected today'
            : `Period in ${until} day${until === 1 ? '' : 's'}`}
      </p>
      <p className="cycle-summary-sub">
        {p.cycleDay ? `Day ${p.cycleDay} · ` : ''}
        around {shortDay(p.nextPeriodStart!)}, give or take {p.uncertaintyDays} days
      </p>
      <dl className="cycle-facts">
        <div>
          <dt>Cycle length</dt>
          <dd>{p.averageCycleLength} days</dd>
        </div>
        <div>
          <dt>Fertile window</dt>
          <dd>{shortDay(p.fertileWindow!.start)} – {shortDay(p.fertileWindow!.end)}</dd>
        </div>
        <div>
          <dt>Based on</dt>
          <dd>{p.cyclesObserved} cycle{p.cyclesObserved === 1 ? '' : 's'}</dd>
        </div>
      </dl>
      <p className="cycle-disclaimer">
        These are estimates from the dates logged here, not medical advice. A fertile
        window is not contraception — it is a guess with an error bar, and the error bar
        is the honest part.
      </p>
    </section>
  );
}

function TrackingQuestion() {
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Cycle</h1>
        <p className="page-sub">One of you logs it. Both of you can see it.</p>
      </header>
      <div className="cycle-choice">
        <p>Whose cycle is this page for?</p>
        <div className="row">
          <button
            type="button" className="chip"
            onClick={() => void saveSettings({ tracksCycle: true })}
          >
            Mine
          </button>
          <button
            type="button" className="chip"
            onClick={() => void saveSettings({ tracksCycle: false })}
          >
            My partner&rsquo;s
          </button>
        </div>
        <p className="cycle-hint">You can change this in Settings later.</p>
      </div>
    </div>
  );
}

function ReadOnlyDay({ day, entry }: { day: DayKey; entry?: CycleEntry }) {
  return (
    <section className="cal-sheet">
      <h3 className="cal-sheet-day">{longDay(day)}</h3>
      {!entry ? (
        <p className="cycle-hint">Nothing logged.</p>
      ) : (
        <ul className="cycle-readout">
          {entry.flow ? <li><strong>Flow</strong> {entry.flow}</li> : null}
          {entry.symptoms?.length ? <li><strong>Symptoms</strong> {entry.symptoms.join(', ')}</li> : null}
          {entry.moods?.length ? <li><strong>Mood</strong> {entry.moods.join(', ')}</li> : null}
          {entry.notes ? <li><strong>Note</strong> {entry.notes}</li> : null}
          {entry.checkInComplete && !entry.flow && !entry.symptoms?.length ? (
            <li>Checked in, nothing to report.</li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

function DaySheet({ day, memberId, entry }: { day: DayKey; memberId: string; entry?: CycleEntry }) {
  const [flow, setFlow] = useState(entry?.flow);
  const [symptoms, setSymptoms] = useState<string[]>(entry?.symptoms ?? []);
  const [moods, setMoods] = useState<string[]>(entry?.moods ?? []);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [saved, setSaved] = useState(false);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const save = async (over: Partial<CycleEntry> = {}) => {
    await putCycle(memberId, day, {
      // Recorded even when nothing else is: without it there is no way to tell
      // a symptom-free day from a day nobody opened the app, and every average
      // downstream is then wrong in a way nobody notices.
      checkInComplete: true,
      flow, symptoms, moods, notes: notes.trim() || undefined,
      periodStart: entry?.periodStart,
      ...over,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  return (
    <section className="cal-sheet">
      <h3 className="cal-sheet-day">{longDay(day)}</h3>

      <h4 className="cycle-group">Flow</h4>
      <div className="chips">
        {FLOWS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={flow === f.id ? 'chip chip-on' : 'chip'}
            aria-pressed={flow === f.id}
            onClick={() => setFlow(flow === f.id ? undefined : f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {SYMPTOM_GROUPS.map((group) => (
        <div key={group.label}>
          <h4 className="cycle-group">{group.label}</h4>
          <div className="chips">
            {group.items.map((item) => (
              <button
                key={item}
                type="button"
                className={symptoms.includes(item) ? 'chip chip-on' : 'chip'}
                aria-pressed={symptoms.includes(item)}
                onClick={() => setSymptoms((s) => toggle(s, item))}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ))}

      <h4 className="cycle-group">Mood</h4>
      <div className="chips">
        {MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            className={moods.includes(mood) ? 'chip chip-on' : 'chip'}
            aria-pressed={moods.includes(mood)}
            onClick={() => setMoods((m) => toggle(m, mood))}
          >
            {mood}
          </button>
        ))}
      </div>

      <h4 className="cycle-group">Note</h4>
      <textarea
        className="field cycle-note"
        rows={3}
        value={notes}
        placeholder="Anything worth remembering."
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="cycle-actions">
        <button type="button" className="chip chip-on" onClick={() => void save()}>
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => void save({ periodStart: !entry?.periodStart, flow: flow ?? 'medium' })}
        >
          {entry?.periodStart ? 'Not first day' : 'First day'}
        </button>
      </div>
    </section>
  );
}
