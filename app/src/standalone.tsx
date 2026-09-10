import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeBackdrop, ThemeProvider } from './themes/ThemeProvider';
import { THEMES } from './themes';
import { useTheme } from './themes/ThemeProvider';
import { StudyPage } from './features/study/StudyPage';
import { exportState, importState, isVolatile, localStudyStore } from './db/localStudyStore';
import './styles.css';

/**
 * The standalone entry.
 *
 * Everything the app version has and this one does not is deliberate: no
 * router, no tab bar, no chat panel, no sync, and above all no Dexie — the
 * single-file build has to be able to run off a USB stick on a laptop with no
 * network, and an IndexedDB layer that cannot open would take the page down
 * with it.
 *
 * What it keeps is the theme engine, because the five packs are the app's
 * identity and they cost one import.
 */

function Standalone() {
  return (
    <ThemeProvider>
      <ThemeBackdrop />
      <main className="shell shell-standalone">
        <StudyPage
          store={localStudyStore}
          subtitle="Pick a deck. Everything is kept in this browser."
        />
        <Footer />
      </main>
    </ThemeProvider>
  );
}

/**
 * The controls the app version has no need for: a theme picker (there is no
 * Settings screen here) and the export/import pair that is the only way
 * progress survives a reload on a `file://` page.
 */
function Footer() {
  const { themeId, setThemeId } = useTheme();
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [volatileNow, setVolatileNow] = useState(false);

  // `isVolatile` only becomes true after a write has actually been attempted,
  // so it is polled rather than read once at mount.
  useEffect(() => {
    const timer = setInterval(() => setVolatileNow(isVolatile()), 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  function save() {
    const blob = new Blob([exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `heartbeat-study-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNote('Saved. Keep it beside this file.');
  }

  async function load(chosen: File) {
    const ok = importState(await chosen.text());
    setNote(ok ? 'Loaded. Reopening.' : 'That file was not one of these.');
    if (ok) setTimeout(() => window.location.reload(), 600);
  }

  return (
    <footer className="standalone-foot">
      {volatileNow ? (
        <p className="standalone-warn">
          This browser will not let a page opened from a file remember anything.
          The sitting works, but closing the tab loses it — use <b>Save progress</b>,
          or open this file from a web address instead.
        </p>
      ) : null}

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

      <div className="row">
        <button type="button" className="quiet" onClick={save}>Save progress</button>
        <button type="button" className="quiet" onClick={() => file.current?.click()}>
          Load progress
        </button>
      </div>

      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) void load(chosen);
          event.target.value = '';
        }}
      />

      {note ? <p className="standalone-note" role="status">{note}</p> : null}

      <p className="standalone-about">
        The study page from <b>HeartBeat</b>, in one file. No network, no account,
        nothing leaves this browser.
      </p>
    </footer>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Standalone />
  </StrictMode>,
);
