import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings, saveSettings } from '../../db/database';
import { useTheme } from '../../themes/ThemeProvider';
import { THEMES } from '../../themes';
import { health, pairJoin, pairStart } from '../../pwa/api';

/**
 * Pairing, theme, and whether the app should calm down.
 *
 * Deliberately the minimum. Pairing is here because the message thread and the
 * boss fight are both useless without it, and there was previously no way to do
 * it from inside the app at all — the token had to be pasted in by hand.
 */
export function SettingsPage() {
  const settings = useLiveQuery(loadSettings, []);
  const { themeId, setThemeId, calmMode, setCalmMode } = useTheme();

  const [invite, setInvite] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [backend, setBackend] = useState<'checking' | 'up' | 'down'>('checking');

  const paired = Boolean(settings?.workerSecret && settings?.coupleId);

  useEffect(() => {
    let live = true;
    health().then((h) => {
      if (live) setBackend(h?.ok ? 'up' : 'down');
    });
    return () => { live = false; };
  }, []);

  const start = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await pairStart();
      await saveSettings({
        coupleId: result.coupleId,
        memberId: result.memberId,
        workerSecret: result.token,
      });
      setInvite(result.invite);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Pairing could not start.');
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await pairJoin(code);
      await saveSettings({
        coupleId: result.coupleId,
        memberId: result.memberId,
        workerSecret: result.token,
      });
      setCode('');
      setNote('Paired.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Pairing, theme and your partner.</p>
      </header>

      <section className="set-block">
        <h2 className="section-title">The two of you</h2>
        {paired ? (
          <>
            <p className="section-sub">
              This phone is paired. Messages, the calendar and the boss fight all
              travel between the two of you.
            </p>
            {invite ? <InviteCard code={invite} /> : null}
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => void start()}
            >
              Start a new pairing instead
            </button>
          </>
        ) : (
          <>
            <p className="section-sub">
              One of you starts a pairing and reads out the code; the other types
              it in. Nothing is shared until that happens.
            </p>
            {invite ? <InviteCard code={invite} /> : null}
            <button type="button" className="primary" disabled={busy} onClick={() => void start()}>
              Start a pairing
            </button>

            <form
              className="add-task"
              onSubmit={(e) => {
                e.preventDefault();
                void join();
              }}
            >
              <input
                className="field"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Or type their code"
                aria-label="Invite code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <button type="submit" className="quiet" disabled={busy || !code.trim()}>
                Join with this code
              </button>
            </form>
          </>
        )}
        {note ? <p className="section-sub">{note}</p> : null}
        {backend === 'down' ? (
          <p className="section-sub">
            The server is not answering, so pairing and speech will not work yet.
            Everything else on this phone still does.
          </p>
        ) : null}
      </section>

      <section className="set-block">
        <h2 className="section-title">Theme</h2>
        <div className="chips" role="radiogroup" aria-label="Theme">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={themeId === theme.id}
              className={`chip ${themeId === theme.id ? 'chip-on' : ''}`}
              onClick={() => setThemeId(theme.id)}
            >
              {theme.name}
            </button>
          ))}
        </div>
        <p className="section-sub">{THEMES.find((t) => t.id === themeId)?.blurb}</p>
      </section>

      <section className="set-block">
        <h2 className="section-title">Cycle</h2>
        <label className="set-toggle">
          <input
            type="checkbox"
            checked={settings?.tracksCycle === true}
            onChange={(e) => void saveSettings({ tracksCycle: e.target.checked })}
          />
          <span>I log my cycle. Off means the page shows my partner&rsquo;s.</span>
        </label>
        <p className="section-sub">
          The page itself, and its PIN, are on <Link to="/cycle">the Cycle screen</Link>. A PIN
          set there stays on this phone and is never synced.
        </p>
      </section>

      <section className="set-block">
        <h2 className="section-title">Calm</h2>
        <label className="set-toggle">
          <input
            type="checkbox"
            checked={calmMode}
            onChange={(e) => setCalmMode(e.target.checked)}
          />
          <span>Still backdrops, no drifting, no pulsing.</span>
        </label>
      </section>
    </div>
  );
}

/**
 * The invite code, big enough to read aloud across a room. Single-use and short
 * lived — a pairing link that works forever is a permanent key to the couple's
 * data sitting in a chat thread.
 */
function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="invite">
      <span className="invite-code">{code}</span>
      <button
        type="button"
        className="quiet"
        onClick={() => {
          navigator.clipboard?.writeText(code).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <p className="section-sub">Good for fifteen minutes, and only once.</p>
    </div>
  );
}
