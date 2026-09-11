import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeBackdrop, ThemeProvider } from './themes/ThemeProvider';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ExercisePage } from './features/exercise/ExercisePage';
import { MoodPage } from './features/mood/MoodPage';
import { WorkPage } from './features/work/WorkPage';
import { TasksPage } from './features/tasks/TasksPage';
import { PartyPage } from './features/party/PartyPage';
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
import { MenuSheet } from './components/MenuSheet';
import { Icon } from './components/icons';
import { QuestsPage } from './features/quests/QuestsPage';
import { GoalsPage } from './features/goals/GoalsPage';
import { GoalIdeasPage } from './features/goals/GoalIdeasPage';
import { AreasPage } from './features/goals/AreasPage';
import { ActivitiesPage } from './features/activities/ActivitiesPage';
import { BreathePage } from './features/activities/BreathePage';
import { ReflectionsPage } from './features/activities/ReflectionsPage';
import { SoundscapesPage } from './features/activities/SoundscapesPage';
import { MovementsPage } from './features/activities/MovementsPage';
import { QuizzesPage } from './features/activities/QuizzesPage';
import { TimerPage } from './features/activities/TimerPage';
import { KindnessPage } from './features/activities/KindnessPage';
import { FirstAidPage } from './features/activities/FirstAidPage';
import { FriendsPage } from './features/party/FriendsPage';
import { OPEN_WHILE_UNPAIRED, PRIMARY_TABS } from './nav';


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
                    {/* The five tabs that are not Home. Party is still a route
                        of its own — it is all of these at once, which is the
                        view somebody who has been away for a week wants — and
                        the four below are the same sections, one screen each,
                        so the bar can lead somewhere specific. */}
                    <Route path="/quests" element={<QuestsPage />} />
                    {/* Ideas before the bare /goals so the more specific path
                        is not swallowed by it. */}
                    <Route path="/goals/ideas" element={<GoalIdeasPage />} />
                    <Route path="/goals" element={<GoalsPage />} />
                    <Route path="/areas" element={<AreasPage />} />
                    {/* The hub's children, most specific first. Reachable from
                        /activities rather than from the menu — nine more menu
                        tiles would be the clutter the hub exists to avoid; see
                        the hub-child rule in nav.test.ts. */}
                    <Route path="/activities/breathe" element={<BreathePage />} />
                    <Route path="/activities/reflections" element={<ReflectionsPage />} />
                    <Route path="/activities/soundscapes" element={<SoundscapesPage />} />
                    <Route path="/activities/movements" element={<MovementsPage />} />
                    <Route path="/activities/quizzes" element={<QuizzesPage />} />
                    <Route path="/activities/timer" element={<TimerPage />} />
                    <Route path="/activities/kindness" element={<KindnessPage />} />
                    <Route path="/activities/first-aid" element={<FirstAidPage />} />
                    <Route path="/activities" element={<ActivitiesPage />} />
                    <Route path="/shop" element={<PartyPage only={['shop']} title="Shop" />} />
                    <Route path="/friends" element={<FriendsPage />} />
                    <Route path="/bag" element={<PartyPage only={['worn', 'colours', 'companions']} title="Bag" />} />
                    <Route path="/birb" element={<PartyPage only={['house', 'adventures', 'companions', 'boss']} title="Birb" />} />
                    <Route path="/party" element={<PartyPage />} />
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
              gate, which is how you get back out of Settings, and a bar that
              disappears is harder to understand than one that is plainly waiting.
              Locked only once the answer is in, for the reason the gate waits:
              otherwise a phone that paired months ago dims its whole bar for a
              frame on every cold start. */}
          <MenuSheet locked={ready && !paired} />
          <TabBar locked={ready && !paired} />
        </HashRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

/**
 * The six, across the bottom, as a grid.
 *
 * A grid of six equal columns rather than a flex row, so every tab is exactly
 * one sixth of the width whatever its label happens to be — "Home" and
 * "Friends" get the same target, and the bar does not shift under the thumb
 * when the active label grows. It replaces a vertical rail that had grown to
 * eight and could not have taken fourteen; see the note at the top of `nav.ts`.
 *
 * Every tab keeps its label, at every width. The rail hid all but the active
 * one below 640px because a 64px column had no room; six across the bottom of
 * even a small phone does.
 */
function TabBar({ locked }: { locked: boolean }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {PRIMARY_TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className="tabbar-tab"
          data-locked={locked && !OPEN_WHILE_UNPAIRED.includes(tab.to) ? 'true' : undefined}
        >
          <span className="tabbar-glyph"><Icon name={tab.icon} /></span>
          <span className="tabbar-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
