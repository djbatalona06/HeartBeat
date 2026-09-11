import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, loadSettings } from '../../db/database';
import {
  addReflection,
  deleteReflection,
  ensureIdentity,
  shareReflection,
} from '../../db/repository';
import { todayKey } from '../../domain/day';
import {
  PROMPTS,
  PROMPT_KINDS,
  byNewest,
  preview,
  promptForDay,
  streakOf,
  type Prompt,
  type Reflection,
} from '../../domain/selfcare/reflections';

/**
 * The journal.
 *
 * Private by default, and that is the design rather than a default nobody got
 * round to changing. Everything else in this app exists so two people can read
 * each other's day; a journal is the one thing that stops being usable the
 * moment it is read by somebody else. So an entry is yours until you press
 * Share, and Share is its own action — never a side effect of writing or
 * editing something.
 *
 * The question of the day is derived from the date rather than stored or
 * rolled, so coming back to a half-written answer does not silently swap the
 * question out from under it.
 */
export function ReflectionsPage() {
  const settings = useLiveQuery(loadSettings, []);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);

  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const memberId = settings?.memberId ?? identity?.memberId;
  const coupleId = settings?.coupleId ?? identity?.coupleId;
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  const entries = useLiveQuery(
    async (): Promise<Reflection[]> => (memberId
      ? db.reflections.where('memberId').equals(memberId).toArray()
      : []),
    [memberId],
  );

  const mine = useMemo(() => byNewest(entries ?? []), [entries]);
  const streak = streakOf(mine, day);

  const [prompt, setPrompt] = useState<Prompt>(() => promptForDay(day));
  const [body, setBody] = useState('');
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');

  async function save() {
    if (!memberId || !coupleId || !body.trim()) return;
    const id = await addReflection({
      memberId, coupleId, day, body, promptId: prompt.id, prompt: prompt.text,
    });
    if (!id) return;
    setBody('');
    setNote('Saved. Only you can see it.');
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Reflections</h1>
        <p className="page-sub">
          {streak > 1 ? `${streak} days in a row. ` : ''}
          Yours alone unless you say otherwise.
        </p>
      </header>

      <Link className="goal-link" to="/activities">← Activities</Link>

      <section className="panel">
        <h2 className="section-title">{prompt.text}</h2>
        <p className="section-sub">
          {PROMPT_KINDS[prompt.kind]} · one sentence is a real answer
        </p>

        <textarea
          className="field reflect-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="However it comes out."
          rows={5}
          aria-label="Your reflection"
        />

        <div className="row">
          <button type="button" className="primary" disabled={!body.trim()} onClick={save}>
            Save
          </button>
          <button type="button" className="chip" onClick={() => setPicking(!picking)}>
            {picking ? 'Close' : 'Another question'}
          </button>
        </div>

        {picking ? (
          <div className="chips" role="radiogroup" aria-label="Choose a question">
            {PROMPTS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === prompt.id}
                className={`chip reflect-prompt ${p.id === prompt.id ? 'chip-on' : ''}`}
                onClick={() => { setPrompt(p); setPicking(false); }}
              >
                {p.text}
              </button>
            ))}
          </div>
        ) : null}

        {note ? <p className="section-sub" role="status">{note}</p> : null}
      </section>

      <section className="panel">
        <h2 className="section-title">Written so far</h2>
        {mine.length === 0 ? (
          <p className="section-sub">Nothing yet. The first one is the hard one.</p>
        ) : (
          <ul className="reflect-list">
            {mine.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                onShare={(shared) => shareReflection(entry.id, shared)}
                onDelete={() => deleteReflection(entry.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One entry, collapsed until opened. Delete asks once, in place. */
function Entry({ entry, onShare, onDelete }: {
  entry: Reflection;
  onShare: (shared: boolean) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="reflect-entry">
      <button
        type="button"
        className="reflect-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="reflect-day">{entry.day}</span>
        <span className="reflect-preview">{preview(entry.body)}</span>
        {entry.shared ? <span className="reflect-shared" title="Shared">shared</span> : null}
      </button>

      {open ? (
        <div className="reflect-body">
          {entry.prompt ? <p className="reflect-question">{entry.prompt}</p> : null}
          <p className="reflect-text">{entry.body}</p>
          <div className="row">
            <button type="button" className="chip" onClick={() => onShare(!entry.shared)}>
              {entry.shared ? 'Make private again' : 'Share with them'}
            </button>
            {confirming ? (
              <button type="button" className="chip chip-danger" onClick={onDelete}>
                Really delete
              </button>
            ) : (
              <button type="button" className="chip" onClick={() => setConfirming(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}
