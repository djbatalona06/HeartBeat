import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { VoiceInput } from '../../components/VoiceInput';
import { useMessages } from './useMessages';

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

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { messages, send, paired, offline } = useMessages(open);

  const foot = useRef<HTMLDivElement>(null);
  const seen = useRef(0);
  const [unread, setUnread] = useState(0);

  // Anything that arrived from the other person while the sheet was shut.
  useEffect(() => {
    if (open) {
      seen.current = messages.length;
      setUnread(0);
      return;
    }
    const theirs = messages.filter((m) => !m.mine).length;
    setUnread(Math.max(0, theirs - seen.current));
  }, [messages, open]);

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
        {unread > 0 ? (
          <span className="chat-unread" aria-label={`${unread} unread`}>{unread}</span>
        ) : null}
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
