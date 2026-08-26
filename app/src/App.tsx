import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeBackdrop, ThemeProvider } from './themes/ThemeProvider';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ExercisePage } from './features/exercise/ExercisePage';
import { MoodPage } from './features/mood/MoodPage';
import { WorkPage } from './features/work/WorkPage';

const TABS = [
  { to: '/', label: 'Home', glyph: '♥' },
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
            <Route path="/mood" element={<MoodPage />} />
            <Route path="/exercise" element={<ExercisePage />} />
            <Route path="/work" element={<WorkPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
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
