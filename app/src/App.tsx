import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeBackdrop, ThemeProvider } from './themes/ThemeProvider';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ExercisePage } from './features/exercise/ExercisePage';
import { MoodPage } from './features/mood/MoodPage';
import { WorkPage } from './features/work/WorkPage';
import { TasksPage } from './features/tasks/TasksPage';
import { PartyPage } from './features/party/PartyPage';
import { CyclePage } from './features/cycle/CyclePage';
import { ChatPanel } from './features/chat/ChatPanel';
import { PairGate } from './features/pairing/PairGate';
import { usePairing } from './features/pairing/usePairing';
import { useSync } from './pwa/useSync';

const TABS = [
  { to: '/', label: 'Home', glyph: '♥' },
  { to: '/tasks', label: 'Tasks', glyph: '✦' },
  { to: '/mood', label: 'Mood', glyph: '◑' },
  { to: '/exercise', label: 'Move', glyph: '▲' },
  { to: '/work', label: 'Work', glyph: '▦' },
  { to: '/settings', label: 'You', glyph: '☰' },
];

/**
 * What stays open on a phone with no partner yet.
 *
 * Settings, because it holds the pairing form itself — a gate that locked the
 * only way through it would be a wall. It also holds the theme picker, which is
 * the reason not to narrow this to a pairing-only screen: the first screen
 * anyone sees should be one they chose, and choosing costs nothing and writes
 * nothing that would have to be re-keyed later.
 */
const OPEN_WHILE_UNPAIRED = ['/settings'];

export function App() {
  // Reconciles the day log with the other phone. Mounted here rather than in a
  // page so it keeps running whichever tab is open.
  useSync();

  // Whether there are two of you, and the re-key that carries this phone's rows
  // over the moment there are. See features/pairing/usePairing.ts.
  const { ready, paired } = usePairing();

  return (
    <ThemeProvider>
      <ThemeBackdrop />
      {/* HashRouter, not BrowserRouter: notification deep links and a cold
          reload both have to resolve without a server-side rewrite rule. */}
      <HashRouter>
        <main className="shell">
          {/* Inside the router, so the gate can leave the route it interrupted
              standing: a deep link arriving unpaired waits here and opens for
              real once the second phone joins, rather than being redirected
              away and forgotten. */}
          <PairGate ready={ready} paired={paired} open={OPEN_WHILE_UNPAIRED}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              {/* Not a tab. Six across the bottom is already the ceiling on a
                  phone, and the party is somewhere you go from the sheet. */}
              <Route path="/party" element={<PartyPage />} />
              {/* Not a tab either, and for a second reason: a seventh label is
                  one too many, and a page that can be locked should not announce
                  itself along the bottom of every other screen. */}
              <Route path="/cycle" element={<CyclePage />} />
              <Route path="/mood" element={<MoodPage />} />
              <Route path="/exercise" element={<ExercisePage />} />
              <Route path="/work" element={<WorkPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PairGate>
        </main>
        {/* Inside the router so its "open Settings" link works, but outside
            <main> so it survives every route change — the thread should not
            reset because she looked at the calendar mid-sentence. A thread with
            one end is not a thread, so it waits for the pairing. */}
        {paired ? <ChatPanel /> : null}
        {/* Kept while unpaired rather than hidden: every locked tab leads to the
            gate, which is how you get back out of Settings, and a bar that
            disappears is harder to understand than one that is plainly waiting.
            Locked only once the answer is in, for the reason the gate waits:
            otherwise a phone that paired months ago dims its whole bar for a
            frame on every cold start. */}
        <NavBar locked={ready && !paired} />
      </HashRouter>
    </ThemeProvider>
  );
}

function NavBar({ locked }: { locked: boolean }) {
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className="tab"
          data-locked={locked && !OPEN_WHILE_UNPAIRED.includes(tab.to) ? 'true' : undefined}
        >
          <span className="tab-glyph" aria-hidden="true">{tab.glyph}</span>
          <span className="tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
