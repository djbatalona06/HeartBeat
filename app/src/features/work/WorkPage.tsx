import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, putWorkEvent, removeWorkEvent } from '../../db/repository';
import { VoiceInput } from '../../components/VoiceInput';
import { parseEvent } from '../../domain/voice/parseEvent';
import { addDays, todayKey } from '../../domain/day';
import { DEFAULT_TIMEZONE, type DayKey, type MinuteOfDay, type WorkEvent } from '../../domain/types';

/**
 * The shared calendar.
 *
 * A month at a glance, then one day at a time. Both partners' events sit in the
 * same grid, marked but not separated: the point of a calendar you both can see
 * is seeing when the other person is busy, not auditing whose week is fuller.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthOf(day: DayKey): string {
  return day.slice(0, 7);
}

/** Day-of-week for a DayKey without going through a local Date. */
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
  const total = (y * 12 + (m - 1)) + delta;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** 540 → "9:00 am". Minutes past midnight are what WorkEvent stores. */
export function clockOf(minutes: MinuteOfDay): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const mm = String(minutes % 60).padStart(2, '0');
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${suffix}`;
}

/** "9:00 am" / "09:00" back into minutes, for the time field. */
function minutesOf(value: string): MinuteOfDay | undefined {
  const m = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  if (h > 23) return undefined;
  return h * 60 + Number(m[2]);
}

/** Minutes back into the "HH:MM" an <input type="time"> wants. */
function timeValue(minutes: MinuteOfDay | undefined): string {
  if (minutes === undefined) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function byStart(a: WorkEvent, b: WorkEvent): number {
  // All-day events sit above the timed ones rather than at midnight.
  const av = a.startsAt ?? -1;
  const bv = b.startsAt ?? -1;
  return av - bv || a.title.localeCompare(b.title);
}

export function WorkPage() {
  const settings = useLiveQuery(loadSettings, []);
  const timeZone = settings?.timeZone ?? DEFAULT_TIMEZONE;
  const today = todayKey(timeZone);

  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const [selected, setSelected] = useState<DayKey>(today);
  const [month, setMonth] = useState<string>(monthOf(today));

  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // The whole month is read at once: a month grid needs to know which days have
  // anything on them, and 31 separate queries to draw 31 dots is absurd.
  const events = useLiveQuery(async () => {
    const days = daysInMonth(month);
    return db.work
      .where('day')
      .between(days[0], days[days.length - 1], true, true)
      .toArray();
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<DayKey, WorkEvent[]>();
    for (const e of events ?? []) {
      const list = map.get(e.day);
      if (list) list.push(e);
      else map.set(e.day, [e]);
    }
    for (const list of map.values()) list.sort(byStart);
    return map;
  }, [events]);

  const days = daysInMonth(month);
  const lead = weekdayOf(days[0]);
  const [year, monthNumber] = month.split('-').map(Number);
  const selectedEvents = byDay.get(selected) ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Work</h1>
        <p className="page-sub">A calendar you both can see.</p>
      </header>

      <div className="cal-head">
        <button
          type="button"
          className="cal-step"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h2 className="cal-month">{MONTHS[monthNumber - 1]} {year}</h2>
        <button
          type="button"
          className="cal-step"
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="cal-grid" role="grid" aria-label="Month">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i} className="cal-weekday" aria-hidden="true">{initial}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} className="cal-blank" aria-hidden="true" />
        ))}
        {days.map((day) => {
          const count = byDay.get(day)?.length ?? 0;
          return (
            <button
              key={day}
              type="button"
              className="cal-day"
              data-today={day === today ? 'true' : undefined}
              data-selected={day === selected ? 'true' : undefined}
              aria-pressed={day === selected}
              aria-label={`${day}${count ? `, ${count} event${count > 1 ? 's' : ''}` : ''}`}
              onClick={() => setSelected(day)}
            >
              <span className="cal-num">{Number(day.slice(8, 10))}</span>
              {/* One dot per event up to three, then a count. A row of ten dots
                  is less readable than the number ten. */}
              {count > 0 && count <= 3 ? (
                <span className="cal-dots" aria-hidden="true">
                  {Array.from({ length: count }, (_, i) => (
                    <i key={i} className="cal-dot" />
                  ))}
                </span>
              ) : null}
              {count > 3 ? <span className="cal-count" aria-hidden="true">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <DaySheet
        day={selected}
        today={today}
        events={selectedEvents}
        memberId={identity?.memberId ?? null}
        onJumpToMonth={(next) => {
          setMonth(monthOf(next));
          setSelected(next);
        }}
      />
    </div>
  );
}

function DaySheet({
  day,
  today,
  events,
  memberId,
  onJumpToMonth,
}: {
  day: DayKey;
  today: DayKey;
  events: WorkEvent[];
  memberId: string | null;
  onJumpToMonth: (day: DayKey) => void;
}) {
  const [editing, setEditing] = useState<WorkEvent | null>(null);
  const [adding, setAdding] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; time: string }>({ title: '', time: '' });

  // Moving to another day closes whatever was open, so an edit never lands on
  // a day you are no longer looking at.
  useEffect(() => {
    setEditing(null);
    setAdding(false);
    setHeard(null);
    setDraft({ title: '', time: '' });
  }, [day]);

  const label =
    day === today ? 'Today'
    : day === addDays(today, 1) ? 'Tomorrow'
    : day === addDays(today, -1) ? 'Yesterday'
    : day;

  // Speech can name a different day than the one on screen — "dentist next
  // Tuesday" while looking at today. Follow it there rather than silently
  // filing the event where the finger happened to be.
  const applyTranscript = (text: string) => {
    if (!text.trim()) return;
    const intent = parseEvent(text, today);
    setDraft({ title: intent.title, time: timeValue(intent.startsAt) });
    setHeard(text.trim());
    setEditing(null);
    setAdding(true);
    if (intent.day !== day) onJumpToMonth(intent.day);
  };

  const save = async (target: WorkEvent | null) => {
    if (!memberId) return;
    const title = draft.title.trim();
    if (!title) return;
    await putWorkEvent(
      memberId,
      day,
      { title, startsAt: minutesOf(draft.time), source: 'manual' },
      target?.id,
    );
    setAdding(false);
    setEditing(null);
    setHeard(null);
    setDraft({ title: '', time: '' });
  };

  const form = (target: WorkEvent | null) => (
    <form
      className="add-task"
      onSubmit={(e) => {
        e.preventDefault();
        void save(target);
      }}
    >
      <input
        className="field"
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        placeholder="What is it?"
        aria-label="Event name"
        autoFocus
      />
      <label className="cal-time">
        <span className="slot-name">Time</span>
        <input
          className="field"
          type="time"
          value={draft.time}
          onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
          aria-label="Start time"
        />
      </label>
      {heard ? <p className="heard">Heard: <q>{heard}</q></p> : null}
      <div className="row">
        <button type="submit" className="primary">{target ? 'Save it' : 'Add it'}</button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setAdding(false);
            setEditing(null);
            setHeard(null);
          }}
        >
          Not now
        </button>
      </div>
    </form>
  );

  return (
    <section className="cal-sheet">
      <h2 className="section-title">{label}</h2>

      {events.length === 0 ? (
        <p className="section-sub">Nothing on this day.</p>
      ) : (
        <ul className="cal-events">
          {events.map((event) => (
            <li key={event.id} className="cal-event">
              {editing?.id === event.id ? (
                form(event)
              ) : (
                <>
                  <span className="cal-event-time">
                    {event.startsAt === undefined ? 'All day' : clockOf(event.startsAt)}
                  </span>
                  <span className="cal-event-title">{event.title}</span>
                  <button
                    type="button"
                    className="cal-event-edit"
                    aria-label={`Edit ${event.title}`}
                    onClick={() => {
                      setAdding(false);
                      setHeard(null);
                      setEditing(event);
                      setDraft({ title: event.title, time: timeValue(event.startsAt) });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="cal-event-remove"
                    aria-label={`Remove ${event.title}`}
                    onClick={() => void removeWorkEvent(event.id)}
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && !editing ? (
        form(null)
      ) : editing ? null : (
        <>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setDraft({ title: '', time: '' });
              setHeard(null);
              setAdding(true);
            }}
          >
            Add something
          </button>
          <VoiceInput
            onTranscript={applyTranscript}
            label="Say it instead"
            hint="“dentist next Tuesday at 2pm”"
          />
        </>
      )}
    </section>
  );
}
