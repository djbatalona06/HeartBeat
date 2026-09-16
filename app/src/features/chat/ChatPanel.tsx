import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { VoiceInput } from '../../components/VoiceInput';
import { useMessages } from './useMessages';
import { BadgeDot } from '../../ui/BadgeDot';
import type { Badges } from '../notifications/useBadges';

/**
 * The thread with the other half of the couple, always within reach.
 *
 * Deliberately not a tab. Six across the bottom is already the ceiling on a
 * phone, and this is not a place you go — it is a thing you reach for while
 * you are in the middle of something else. So it sits above the tab bar as a
 * pill, and opens into a sheet over whatever screen you were on.
 */

function clockOf(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * `badges` is a prop rather than a `useBadges()` call for the reason
 * `SceneBackdrop` accepted the opposite trade: the shell renders this *and* the
 * tab bar, both want the same four live queries, and one call passed down beats
 * two identical sets of reads against IndexedDB on every foreground.
 */
export function ChatPanel({ badges }: { badges: Badges }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { messages, send, paired, offline } = useMessages(open);

  const foot = useRef<HTMLDivElement>(null);

  // The count is not this component's to compute any more.
  //
  // It used to be: a `useRef(0)` of how many had been seen, subtracted from how
  // many had arrived. That was right until the page reloaded, at which point
  // the ref went back to zero, the subtraction went negative, and three waiting
  // messages showed nothing at all. Nobody writes that on purpose — it is what
  // a tally invented at the point of display turns into.
  //
  // Now it comes from `deriveBadges` over a durable watermark, like every other
  // dot in the app. See `domain/notifications/derive.ts`.
  const { byKey, markSeen } = badges;
  const unread = byKey.messages;

  // Opening the thread *is* reading it. Stamped on open rather than on close,
  // because a message that arrives while you are looking at it has been seen,
  // and a watermark set on close would badge it the moment you shut the sheet.
  useEffect(() => {
    if (open) void markSeen('messages');
  }, [open, messages.length, markSeen]);

  useEffect(() => {
    if (open) foot.current?.scrollIntoView({ block: 'end' });
  }, [open, messages.length]);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await send(body);
  };

  if (!open) {
    return (
      <button type="button" className="chat-pill" onClick={() => setOpen(true)}>
        <span aria-hidden="true">✎</span>
        <span>Messages</span>
        <BadgeDot count={unread.count} label={unread.label} />
      </button>
    );
  }

  return (
    <section className="chat" aria-label="Messages">
      <header className="chat-head">
        <h2 className="chat-title">Messages</h2>
        {offline ? <span className="chat-state">not syncing</span> : null}
        <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
      </header>

      {!paired ? (
        // The honest panel rather than an empty thread: an inbox that looks
        // working but silently goes nowhere is worse than one that says why.
        <div className="empty">
          <p>Not paired yet.</p>
          <p className="empty-sub">
            Messages go between the two of you through the server, so both phones
            have to be paired first. <Link to="/settings">Open Settings</Link> to
            start or join a pairing.
          </p>
        </div>
      ) : (
        <>
          <div className="chat-thread">
            {messages.length === 0 ? (
              <p className="section-sub">Nothing yet. Say something.</p>
            ) : (
              <ul className="chat-list">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`chat-msg ${m.mine ? 'chat-mine' : 'chat-theirs'}`}
                    data-pending={m.pending ? 'true' : undefined}
                  >
                    <span className="chat-body">{m.body}</span>
                    <span className="chat-time">
                      {m.pending ? 'sending…' : clockOf(m.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div ref={foot} />
          </div>

          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              className="field"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Say something"
              aria-label="Message"
            />
            <button type="submit" className="primary chat-send" disabled={!draft.trim()}>
              Send
            </button>
          </form>

          {/* Straight dictation — no parsing. What she said is the message. */}
          <VoiceInput
            onTranscript={(text) => setDraft((d) => (d ? `${d} ${text}` : text))}
            label="Say it instead"
          />
        </>
      )}
    </section>
  );
}
