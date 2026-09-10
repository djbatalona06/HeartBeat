import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeBackdrop, ThemeProvider } from './themes/ThemeProvider';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ExercisePage } from './features/exercise/ExercisePage';
import { MoodPage } from './features/mood/MoodPage';
import { WorkPage } from './features/work/WorkPage';
import { TasksPage } from './features/tasks/TasksPage';
import { PartyPage } from './features/party/PartyPage';
import { AssetsPage } from './features/assets/AssetsPage';
import { StudyRoute } from './features/study/StudyRoute';
import { ChatPanel } from './features/chat/ChatPanel';
import { PairGate } from './features/pairing/PairGate';
import { usePairing } from './features/pairing/usePairing';
import { FirstRunGate } from './features/onboarding/FirstRunGate';
import { WelcomePage } from './features/onboarding/WelcomePage';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import { useSync } from './pwa/useSync';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandMenu } from './components/CommandMenu';
import { Icon } from './components/icons';
import { OPEN_WHILE_UNPAIRED, TABS } from './nav';


export function App() {
  // Reconciles the day log with the other phone. Mounted here rather than in a
  // page so it keeps running whichever tab is open.
  useSync();

  // Whether there are two of you, and the re-key that carries this phone's rows
  // over the moment there are. See features/pairing/usePairing.ts.
  const { ready, paired } = usePairing();

  return (
    // Outside ThemeProvider on purpose: the theme engine writes every CSS
    // custom property the app paints with, so it is one of the things this
    // most needs to survive. The fallback carries its own literal colours.
    <ErrorBoundary scope="app">
      <ThemeProvider>
        <ThemeBackdrop />
        {/* HashRouter, not BrowserRouter: notification deep links and a cold
            reload both have to resolve without a server-side rewrite rule. */}
        <HashRouter>
          <main className="shell">
            {/* Outside PairGate, and asks a different question: not whether
                there are two of you, but whether the one of you here has met
                the app at all. Runs even for a visitor who never pairs. */}
            <FirstRunGate>
              {/* Inside the router, so the gate can leave the route it interrupted
                  standing: a deep link arriving unpaired waits here and opens for
                  real once the second phone joins, rather than being redirected
                  away and forgotten. */}
              <PairGate ready={ready} paired={paired} open={OPEN_WHILE_UNPAIRED}>
                {/* Around the routes only. A single page throwing should leave the
                    nav bar and the thread standing, so there is still a way out of
                    the broken screen without force-quitting the app. */}
                <ErrorBoundary scope="route" recoverTo="#/">
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/party" element={<PartyPage />} />
                    <Route path="/assets" element={<AssetsPage />} />
                    {/* The cycle log is the last section of Mood now. The old
                        route is kept as a redirect rather than dropped: it is in
                        notification deep links, in the command menu, and quite
                        possibly on somebody's home screen. */}
                    <Route path="/cycle" element={<Navigate to="/mood" replace />} />
                    <Route path="/study" element={<StudyRoute />} />
                    <Route path="/mood" element={<MoodPage />} />
                    <Route path="/exercise" element={<ExercisePage />} />
                    <Route path="/work" element={<WorkPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/welcome" element={<WelcomePage />} />
                    <Route path="/onboarding" element={<OnboardingPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </ErrorBoundary>
              </PairGate>
            </FirstRunGate>
          </main>
          {/* Inside the router so its "open Settings" link works, but outside
              <main> so it survives every route change — the thread should not
              reset because she looked at the calendar mid-sentence. A thread with
              one end is not a thread, so it waits for the pairing. */}
          {paired ? <ChatPanel /> : null}
          {/* Inside the router, because every one of its entries is a route.
              Outside <main> for the same reason the thread is: it should not
              reset when the screen behind it changes. */}
          {paired ? <CommandMenu /> : null}
          {/* Kept while unpaired rather than hidden: every locked tab leads to the
              gate, which is how you get back out of Settings, and a rail that
              disappears is harder to understand than one that is plainly waiting.
              Locked only once the answer is in, for the reason the gate waits:
              otherwise a phone that paired months ago dims its whole rail for a
              frame on every cold start. */}
          <NavRail locked={ready && !paired} />
        </HashRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

/**
 * Every destination, always on screen, down the left edge.
 *
 * Bottom-aligned rather than top: a phone held one-handed reaches its own
 * bottom corner without shifting grip, and a rail that starts at the top
 * would put Settings, the eighth and least-visited entry, closest to the
 * thumb while Home sat furthest away. Only the active tab carries its label
 * below 640px — see the media query in styles.css — everything else is an
 * icon with an aria-label, which is what `Icon` already renders for.
 */
function NavRail({ locked }: { locked: boolean }) {
  return (
    <nav className="rail" aria-label="Sections">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className="rail-tab"
          aria-label={tab.label}
          data-locked={locked && !OPEN_WHILE_UNPAIRED.includes(tab.to) ? 'true' : undefined}
        >
          <span className="rail-glyph"><Icon name={tab.icon} /></span>
          <span className="rail-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
