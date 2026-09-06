import { useCallback, useEffect, useState } from 'react';
import { DeadlinePicker } from '../../components/DeadlinePicker';
import {
  listCompliments,
  markComplimentRead,
  sendCompliment,
  suggestCompliments,
  type ReceivedCompliment,
} from '../../pwa/api';
import { MAX_COMPLIMENT, type Tone } from '../../domain/compliment/tone';

/**
 * Say something sweet, and see what was said back.
 *
 * The rule the whole component is arranged around: **nothing generated is ever
 * sent unread.** Suggestions arrive as three lines, a person picks one, and the
 * picked line lands in an editable field — so the last thing that touches the
 * message is always the person sending it. There is no button anywhere here
 * that generates and sends in one motion, and that is deliberate rather than an
 * omission.
 *
 * Writing your own is the first-class path, not the fallback. The field is
 * there before any suggestion is asked for, and works with the network off.
 */

interface ComplimentComposerProps {
  token: string | undefined;
  timeZone: string;
  today: string;
  tone: Tone;
  petName?: string;
  blocked?: string[];
  /** Coarse signals only. What the model gets, never the log itself. */
  workoutStreak?: number;
  questName?: string;
}

export function ComplimentComposer({
  token,
  timeZone,
  today,
  tone,
  petName,
  blocked,
  workoutStreak,
  questName,
}: ComplimentComposerProps) {
  const [draft, setDraft] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [fromModel, setFromModel] = useState(false);
  const [when, setWhen] = useState<number | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [inbox, setInbox] = useState<ReceivedCompliment[]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setInbox(await listCompliments(token));
    } catch {
      // Offline, or the endpoint is not deployed yet. An empty list reads as
      // "nothing yet", which is the honest thing to show either way.
      setInbox([]);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Anything unread that has landed is marked read once it is on screen. The
  // notification already brought them here; making them tap again to clear a
  // badge is asking for an acknowledgement of an acknowledgement.
  useEffect(() => {
    if (!token) return;
    for (const item of inbox) {
      if (!item.mine && item.readAt === null) void markComplimentRead(item.id, token);
    }
  }, [inbox, token]);

  async function suggest() {
    if (!token) return;
    setBusy(true);
    setNote(null);
    try {
      const lines = await suggestCompliments(
        { tone, petName, blocked, workoutStreak, questName, day: today },
        token,
      );
      setCandidates(lines);
    } catch (err) {
      setNote(
        err instanceof Error && err.message
          ? err.message
          : 'Suggestions are not answering. You can still write your own.',
      );
    } finally {
      setBusy(false);
    }
  }

  function choose(line: string) {
    setDraft(line);
    // Recorded so the count of how often the model is used is honest. Any edit
    // clears it: a line someone rewrote is theirs, not the model's.
    setFromModel(true);
    setCandidates([]);
  }

  async function send() {
    if (!token || !draft.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      await sendCompliment(
        { body: draft.trim(), deliverAt: when ?? undefined, generated: fromModel, day: today },
        token,
      );
      setDraft('');
      setFromModel(false);
      setWhen(null);
      setScheduling(false);
      setNote(when ? 'Saved — it will land at the time you picked.' : 'Sent.');
      await refresh();
    } catch {
      setNote('That did not go through. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) return null;

  const remaining = MAX_COMPLIMENT - draft.length;

  return (
    <section className="sweet">
      <h2 className="sweet-title">Say something sweet</h2>

      {inbox.length > 0 ? (
        <ul className="sweet-inbox">
          {inbox.slice(0, 4).map((item) => (
            <li key={item.id} className="sweet-note" data-mine={item.mine || undefined}>
              <span className="sweet-note-body">{item.body}</span>
              <span className="sweet-note-who">{item.mine ? 'you' : 'them'}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <textarea
        className="sweet-draft"
        value={draft}
        maxLength={MAX_COMPLIMENT}
        rows={3}
        placeholder="Write something, or ask for a few ideas."
        aria-label="Your message"
        onChange={(e) => {
          setDraft(e.target.value);
          // Edited into their own words, so it stops counting as generated.
          setFromModel(false);
        }}
      />
      <p className="sweet-count" aria-live="polite">
        {remaining} left
      </p>

      {candidates.length > 0 ? (
        <ul className="sweet-ideas">
          {candidates.map((line) => (
            <li key={line}>
              {/* Picking puts it in the field above. It is never sent from here
                  — the last edit always belongs to the person sending it. */}
              <button type="button" className="sweet-idea" onClick={() => choose(line)}>
                {line}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {scheduling ? (
        <DeadlinePicker timeZone={timeZone} value={when} onChange={setWhen} />
      ) : null}

      <div className="sweet-actions">
        <button type="button" className="sweet-button" onClick={send} disabled={busy || !draft.trim()}>
          {when ? 'Schedule it' : 'Send it'}
        </button>
        <button type="button" className="sweet-button sweet-button-quiet" onClick={suggest} disabled={busy}>
          {busy ? 'Thinking…' : 'Give me ideas'}
        </button>
        <button
          type="button"
          className="sweet-button sweet-button-quiet"
          onClick={() => setScheduling((s) => !s)}
          aria-expanded={scheduling}
        >
          {scheduling ? 'Send now instead' : 'Pick a time'}
        </button>
      </div>

      {note ? <p className="sweet-note-line">{note}</p> : null}
    </section>
  );
}
