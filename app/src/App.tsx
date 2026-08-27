import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeBackdrop, ThemeProvider } from './themes/ThemeProvider';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ExercisePage } from './features/exercise/ExercisePage';
import { MoodPage } from './features/mood/MoodPage';
import { WorkPage } from './features/work/WorkPage';
import { TasksPage } from './features/tasks/TasksPage';
import { PartyPage } from './features/party/PartyPage';
import { ChatPanel } from './features/chat/ChatPanel';

const TABS = [
  { to: '/', label: 'Home', glyph: '♥' },
  { to: '/tasks', label: 'Tasks', glyph: '✦' },
  { to: '/mood', label: 'Mood', glyph: '◑' },
  { to: '/exercise', label: 'Move', glyph: '▲' },
  { to: '/work', label: 'Work', glyph: '▦' },
  { to: '/settings', label: 'You', glyph: '☰' },
];

export function App() {
  return (
    <ThemeProvider>
      <ThemeBackdrop />
      {/* HashRouter, not BrowserRouter: notification deep links and a cold
          reload both have to resolve without a server-side rewrite rule. */}
      <HashRouter>
        <main className="shell">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            {/* Not a tab. Six across the bottom is already the ceiling on a
                phone, and the party is somewhere you go from the sheet. */}
            <Route path="/party" element={<PartyPage />} />
            <Route path="/mood" element={<MoodPage />} />
            <Route path="/exercise" element={<ExercisePage />} />
            <Route path="/work" element={<WorkPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {/* Inside the router so its "open Settings" link works, but outside
            <main> so it survives every route change — the thread should not
            reset because she looked at the calendar mid-sentence. */}
        <ChatPanel />
        <NavBar />
      </HashRouter>
    </ThemeProvider>
  );
}

function NavBar() {
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className="tab">
          <span className="tab-glyph" aria-hidden="true">{tab.glyph}</span>
          <span className="tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
