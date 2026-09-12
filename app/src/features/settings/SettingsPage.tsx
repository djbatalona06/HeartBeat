import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import type { Member, Settings } from '../../domain/types';
import { useTheme, type ModePreference } from '../../themes/ThemeProvider';
import { variantOf } from '../../themes/tokens';
import { THEMES } from '../../themes';
import { fetchProfiles, health, pairJoin, pairStart, putProfile } from '../../pwa/api';
import { NotificationsBlock } from './NotificationsBlock';
import { StudyLinkBlock } from './StudyLinkBlock';
import { ComplimentBlock } from './ComplimentBlock';
import { RecoveryBlock } from './RecoveryBlock';
import {
  clearPendingInvite,
  putMyProfile,
  saveMembersFromServer,
  savePairing,
  setCalmMode as storeCalmMode,
  setThemeChoice,
  setTracksCycle,
} from '../../db/repository';
import {
  formatCountdown,
  inviteStatus,
  isCompleteInvite,
  normalizeInvite,
  pairFailure,
} from './pairing';
import { reconcileTheme, readStoredTheme, writeStoredTheme } from './theme';
import { PHOTO_BUDGET_BYTES, coverBox, formatKb, photoBytes, withinBudget } from './photo';

/**
 * Pairing, the theme picker, and the two of you.
 *
 * Pairing leads because nothing else on this screen — or in the app — means
 * anything until two phones are joined, and until this screen existed there was
 * no way to do it from inside the app at all.
 */
/** Light, dark, or whatever the phone says. Declared here rather than in the
 *  theme layer because it is a list of labels, not a fact about a palette. */
const MODE_CHOICES: { id: ModePreference; name: string }[] = [
  { id: 'system', name: 'System' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

export function SettingsPage() {
  const settings = useLiveQuery(loadSettings, []);
  const members = useLiveQuery(() => db.members.toArray(), []);
  const { themeId, setThemeId, calmMode, setCalmMode, mode, modePreference, setModePreference } = useTheme();

  const [backend, setBackend] = useState<'checking' | 'up' | 'down'>('checking');

  useEffect(() => {
    let live = true;
    health().then((h) => { if (live) setBackend(h?.ok ? 'up' : 'down'); });
    return () => { live = false; };
  }, []);

  const paired = Boolean(settings?.workerSecret && settings?.coupleId);

  // A pick this render has made but the settings row has not caught up with.
  // A ref rather than state: it must be readable by the effect below on the
  // very render the pick causes, and changing it should not itself re-render.
  const pendingTheme = useRef<string | null>(null);

  // The saved choice is the durable one; localStorage is what paints first. If
  // they disagree — a reinstall, a cleared browser — the saved id wins and is
  // written back, so the picker never shows a theme the app is not wearing.
  useEffect(() => {
    if (!settings) return;
    const choice = reconcileTheme({
      stored: readStoredTheme(),
      pending: pendingTheme.current,
      saved: settings.themeId,
      known: THEMES.map((t) => t.id),
      fallback: THEMES[0].id,
    });
    // Landed: the row now says what was picked, so the pick stops being news
    // and the two stores go back to answering for themselves.
    if (pendingTheme.current !== null && settings.themeId === pendingTheme.current) {
      pendingTheme.current = null;
    }
    if (choice.themeId !== themeId) setThemeId(choice.themeId);
    if (choice.writeStorage) writeStoredTheme(choice.themeId);
    if (choice.writeSettings) void setThemeChoice(choice.themeId);
  }, [settings, themeId, setThemeId]);

  const chooseTheme = (id: string) => {
    // Recorded before either write, because the re-render `setThemeId` causes
    // reaches the effect above long before the settings write resolves.
    pendingTheme.current = id;
    setThemeId(id);
    writeStoredTheme(id);
    void setThemeChoice(id);
  };

  const chooseCalm = (on: boolean) => {
    setCalmMode(on);
    void storeCalmMode(on);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Pairing, theme and your partner.</p>
      </header>

      <Pairing paired={paired} settings={settings} backend={backend} />

      {paired ? (
        <Partner members={members} settings={settings} />
      ) : null}

      {/* Under pairing on purpose, and rendered whether or not this phone is
          paired: an unpaired one is exactly where "get back in" belongs, and
          it is the reason Settings stays open while unpaired at all. Renders
          nothing when the deploy has no OAuth app. */}
      <RecoveryBlock token={settings?.workerSecret} paired={paired} />

      <section className="set-block">
        <h2 className="section-title">Theme</h2>
        <p className="section-sub">
          Yours alone. Your partner picks their own, and the pet on the home
          screen follows whichever one you are wearing.
        </p>
        <div className="theme-grid" role="radiogroup" aria-label="Theme">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={themeId === theme.id}
              className="theme-card"
              data-on={themeId === theme.id}
              onClick={() => chooseTheme(theme.id)}
            >
              {/* The swatch shows the palette that would actually appear, so
                  switching to Light does not leave five dark chips describing
                  a screen that is now white. */}
              <span className="theme-swatch" aria-hidden="true">
                <span style={{ background: variantOf(theme, mode).colors.base }} />
                <span style={{ background: variantOf(theme, mode).colors.surface }} />
                <span style={{ background: variantOf(theme, mode).colors.accent }} />
              </span>
              <span className="theme-name">{theme.name}</span>
            </button>
          ))}
        </div>
        <p className="section-sub">{THEMES.find((t) => t.id === themeId)?.blurb}</p>

        <div className="mode-row" role="radiogroup" aria-label="Light or dark">
          {MODE_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={modePreference === choice.id}
              className="mode-option"
              data-on={modePreference === choice.id}
              onClick={() => setModePreference(choice.id)}
            >
              {choice.name}
            </button>
          ))}
        </div>
        <p className="section-sub">
          Every theme comes both ways. System follows your phone, so it turns
          over when your phone does.
        </p>
      </section>

      <section className="set-block">
        <h2 className="section-title">Cycle</h2>
        <label className="set-toggle">
          <input
            type="checkbox"
            checked={settings?.tracksCycle === true}
            onChange={(e) => void setTracksCycle(e.target.checked)}
          />
          <span>I log my cycle. Off means the page shows my partner&rsquo;s.</span>
        </label>
        <p className="section-sub">
          The log itself, and its PIN, are at the foot of{' '}
          <Link to="/mood">the Mood screen</Link>. A PIN set there stays on this phone and
          is never synced.
        </p>
      </section>

      <section className="set-block">
        <h2 className="section-title">Calm</h2>
        <label className="set-toggle">
          <input type="checkbox" checked={calmMode} onChange={(e) => chooseCalm(e.target.checked)} />
          <span>Still backdrops, no drifting, no pulsing.</span>
        </label>
      </section>

      <NotificationsBlock />
      <StudyLinkBlock token={settings?.workerSecret} />
      {paired ? <ComplimentBlock /> : null}
    </div>
  );
}

/* ---- pairing -------------------------------------------------------------- */

function Pairing({
  paired, settings, backend,
}: {
  paired: boolean;
  settings: Settings | undefined;
  backend: 'checking' | 'up' | 'down';
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Ticks only while an invite is live, so a paired phone is not re-rendering
  // once a second for a countdown nobody is looking at.
  const [now, setNow] = useState(() => Date.now());

  const invite = settings?.pendingInvite;
  const expiresAt = settings?.pendingInviteExpiresAt;
  const status = inviteStatus(expiresAt, now);

  useEffect(() => {
    if (status !== 'live') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === 'expired') void clearPendingInvite();
  }, [status]);

  const start = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await pairStart();
      await savePairing(result);
      setNow(Date.now());
    } catch (e) {
      setNote(pairFailure(e).message);
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await pairJoin(normalizeInvite(code));
      await savePairing(result);
      setCode('');
      setNote('Paired. You are both looking at the same thing now.');
    } catch (e) {
      setNote(pairFailure(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="set-block">
      <h2 className="section-title">The two of you</h2>

      {paired ? (
        <p className="section-sub">
          This phone is paired. Moods, workouts, the calendar and the boss fight
          all travel between the two of you.
        </p>
      ) : (
        <>
          <p className="pair-lead">Nothing else works until two phones are joined.</p>
          <p className="section-sub">
            One of you starts a pairing and reads out the code; the other types it
            in. No account, no password, no phone number — the code is the whole
            of it, and it is good once.
          </p>
        </>
      )}

      {status === 'live' && invite ? (
        <InviteCard code={invite} msLeft={(expiresAt ?? 0) - now} />
      ) : null}
      {status === 'expired' ? (
        <p className="section-sub">That code has expired. Start another one.</p>
      ) : null}

      <button
        type="button"
        className={paired ? 'quiet' : 'primary'}
        disabled={busy || backend === 'down'}
        onClick={() => void start()}
      >
        {paired ? 'Start a new pairing instead' : 'Start a pairing'}
      </button>

      {paired ? null : (
        <form
          className="pair-join"
          onSubmit={(e) => { e.preventDefault(); void join(); }}
        >
          <input
            className="field"
            value={code}
            onChange={(e) => setCode(normalizeInvite(e.target.value))}
            placeholder="Or type their code"
            aria-label="Invite code"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="quiet"
            disabled={busy || !isCompleteInvite(code) || backend === 'down'}
          >
            Join with this code
          </button>
        </form>
      )}

      {note ? <p className="pair-note">{note}</p> : null}
      {backend === 'down' ? (
        <p className="section-sub">
          The server is not answering, so pairing cannot finish yet. Everything
          already on this phone still works.
        </p>
      ) : null}
    </section>
  );
}

/**
 * The invite code, big enough to read aloud across a room.
 *
 * Single-use and short-lived on purpose: a pairing link that works forever is a
 * permanent key to the couple's data sitting in a chat thread.
 */
function InviteCard({ code, msLeft }: { code: string; msLeft: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="invite">
      <span className="invite-code">{code}</span>
      <button
        type="button"
        className="quiet"
        onClick={() => {
          navigator.clipboard?.writeText(code).then(() => setCopied(true), () => setCopied(false));
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <p className="invite-left">
        Good for <strong>{formatCountdown(msLeft)}</strong> more, and only once.
      </p>
    </div>
  );
}

/* ---- the partner ---------------------------------------------------------- */

function Partner({
  members, settings,
}: {
  members: Member[] | undefined;
  settings: Settings | undefined;
}) {
  const token = settings?.workerSecret;
  const mine = members?.find((m) => m.id === settings?.memberId);
  const theirs = members?.find((m) => m.id !== settings?.memberId);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);

  // The field follows the stored row until the moment it is typed in, so a
  // profile arriving from the other phone does not overwrite what is being
  // typed here.
  useEffect(() => {
    if (!touched) setName(mine?.displayName ?? '');
  }, [mine?.displayName, touched]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetchProfiles(token)
      .then((rows) => { if (live) void saveMembersFromServer(rows); })
      .catch(() => { /* offline is the normal case; the stored rows still render */ });
    return () => { live = false; };
  }, [token]);

  const push = async (patch: { displayName?: string; photoDataUri?: string | null }) => {
    setBusy(true);
    setNote(null);
    try {
      await putMyProfile(patch);
      if (token) await saveMembersFromServer(await putProfile(token, patch));
      setTouched(false);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (chosen: File) => {
    setBusy(true);
    setNote(null);
    try {
      const shrunk = await shrinkToSquare(chosen);
      if (!withinBudget(shrunk)) {
        setNote(`That photo is ${formatKb(photoBytes(shrunk))}, over the ${formatKb(PHOTO_BUDGET_BYTES)} a face is allowed.`);
        return;
      }
      await push({ photoDataUri: shrunk });
    } catch {
      setNote('That image could not be read.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <section className="set-block">
      <h2 className="section-title">The two of you, by name</h2>

      <div className="who-row">
        <Face member={mine} fallback="You" />
        <div className="who-fields">
          <label className="who-label" htmlFor="my-name">Your name</label>
          <input
            id="my-name"
            className="field"
            value={name}
            maxLength={40}
            onChange={(e) => { setTouched(true); setName(e.target.value); }}
            onBlur={() => { if (touched) void push({ displayName: name }); }}
            placeholder="What they call you"
          />
          <div className="who-actions">
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              {mine?.photoDataUri ? 'Change photo' : 'Add a photo'}
            </button>
            {mine?.photoDataUri ? (
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => void push({ photoDataUri: null })}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <input
        ref={file}
        className="who-input"
        type="file"
        accept="image/*"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (chosen) void pick(chosen);
        }}
      />

      <div className="who-row">
        <Face member={theirs} fallback="Them" />
        <div className="who-fields">
          <span className="who-label">Your partner</span>
          <p className="section-sub">
            {theirs?.displayName
              ? theirs.displayName
              : 'They have not put their name in yet. It will turn up here when they do.'}
          </p>
        </div>
      </div>

      {note ? <p className="pair-note">{note}</p> : null}
    </section>
  );
}

function Face({
  member, fallback,
}: {
  member: Member | undefined;
  fallback: string;
}) {
  const shown = member?.displayName?.trim() || fallback;
  if (member?.photoDataUri) {
    return <img className="who-face" src={member.photoDataUri} alt={shown} />;
  }
  return (
    <span className="who-face who-face-blank" aria-hidden="true">
      {shown.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * A file, cropped to its middle square and drawn down to a face-sized JPEG.
 *
 * The canvas work is here rather than in photo.ts because vitest runs in node,
 * where there is no canvas; the sums it uses are all pure and tested there.
 */
async function shrinkToSquare(chosen: File): Promise<string> {
  const bitmap = await createImageBitmap(chosen);
  const box = coverBox(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = box.target;
  canvas.height = box.target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, box.sx, box.sy, box.edge, box.edge, 0, 0, box.target, box.target);
  bitmap.close();
  // Walked down until it fits: a face is small, but a phone camera is not.
  for (const quality of [0.82, 0.7, 0.58, 0.45, 0.35]) {
    const uri = canvas.toDataURL('image/jpeg', quality);
    if (withinBudget(uri)) return uri;
  }
  return canvas.toDataURL('image/jpeg', 0.35);
}
