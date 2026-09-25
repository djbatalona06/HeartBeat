import { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './themes/ThemeProvider';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ExercisePage } from './features/exercise/ExercisePage';
import { MoodPage } from './features/mood/MoodPage';
import { WorkPage } from './features/work/WorkPage';
import { TasksPage } from './features/tasks/TasksPage';
import { ShopPage } from './features/shop/ShopPage';
import { AssetsPage } from './features/assets/AssetsPage';
import { StudyRoute } from './features/study/StudyRoute';
import { ChatPanel } from './features/chat/ChatPanel';
import { PairGate } from './features/pairing/PairGate';
import { usePairing } from './features/pairing/usePairing';
import { FirstRunGate } from './features/onboarding/FirstRunGate';
import { RouteNotFound } from './features/errors/NotHere';
import { BottomNav } from './ui/layout/BottomNav';
import { useBadges } from './features/notifications/useBadges';
import { useNotices } from './features/notifications/useNotices';
import { NotificationHeader } from './features/notifications/NotificationHeader';
import { ToastHost } from './ui/Toast';
import { SceneBackdrop } from './features/home/SceneBackdrop';
import { WelcomePage } from './features/onboarding/WelcomePage';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import { useSync } from './pwa/useSync';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandMenu } from './components/CommandMenu';

/**
 * The two lazy routes in the app.
 *
 * Every other page is imported eagerly and loads instantly, so a blanket
 * conversion would buy a flash of fallback on screens that do not need one.
 * These two are the cases where the split pays for itself: the overworld pulls
 * in Phaser — over a megabyte, for one screen — and Eve's Garden pulls in
 * Phaser *and* the .NET WebAssembly runtime behind it, another 3.5 MB. See
 * `vite.config.ts`, which names both chunks and keeps them out of the
 * service-worker precache.
 *
 * `/overworld` is the older, walkable garden and is on its way out. It stays
 * mounted until Eve's Garden has been played enough to trust, and goes together
 * with `domain/rpg/encounter.ts` — one damage formula ships either way, since
 * nothing in `features/eve-garden/` calls that module.
 */
const OverworldPage = lazy(() => import('./features/rpg/OverworldPage')
  .then((m) => ({ default: m.OverworldPage })));

const EveGardenPage = lazy(() => import('./features/eve-garden/EveGardenPage')
  .then((m) => ({ default: m.EveGardenPage })));
import { MenuSheet } from './components/MenuSheet';
import { StatusHud } from './components/StatusHud';
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
import { SupportPage } from './features/activities/SupportPage';
import { KindnessPage } from './features/activities/KindnessPage';
import { FirstAidPage } from './features/activities/FirstAidPage';
import { FriendsPage } from './features/party/FriendsPage';
import { ToonDefs } from './components/ToonDefs';
import { OPEN_WHILE_UNPAIRED } from './nav';


export function App() {
  // Reconciles the day log with the other phone. Mounted here rather than in a
  // page so it keeps running whichever tab is open.
  useSync();

  // Whether there are two of you, and the re-key that carries this phone's rows
  // over the moment there are. See features/pairing/usePairing.ts.
  const { ready, paired } = usePairing();

  // Every dot in the app, derived once here and handed to the two surfaces that
  // wear them. Nothing below computes its own — see
  // domain/notifications/derive.ts, and the test there that walks the source to
  // make sure nothing starts.
  const badges = useBadges();
  // One wager read for the whole app, beside the one badge read. See
  // `useNotices` for why they are separate hooks.
  const notices = useNotices(badges);

  return (
    // Outside ThemeProvider on purpose: the theme engine writes every CSS
    // custom property the app paints with, so it is one of the things this
    // most needs to survive. The fallback carries its own literal colours.
    <ErrorBoundary scope="app">
      <ThemeProvider>
        {/* The toon light the party art, chests and birbhouse are drawn under.
            Once, here, because a filter id must be unique on the page. */}
        <ToonDefs />
        {/* HashRouter, not BrowserRouter: notification deep links and a cold
            reload both have to resolve without a server-side rewrite rule. */}
        <HashRouter>
          {/* Inside the router, and that is the whole change: the backdrop now
              depends on which screen you are on. Home paints the couple's own
              garden, every other route the pack's canvas, and never both — see
              features/home/SceneBackdrop.tsx. */}
          <SceneBackdrop />
          <ToastHost>
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
                  {/* Above the routes rather than inside `Screen`, because only
                      five of the twenty-five pages use `Screen` -- the rest still
                      write `.page` by hand, so mounting it there would show the
                      line on a fifth of the app. It renders nothing at all unless
                      something is waiting, and it is handed the badges `App`
                      already holds rather than reading its own. */}
                  <NotificationHeader badges={badges} notices={notices} />
                  {/* Around the routes only. A single page throwing should leave the
                      nav bar and the thread standing, so there is still a way out of
                      the broken screen without force-quitting the app. */}
                  <ErrorBoundary scope="route" recoverTo="#/">
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/tasks" element={<TasksPage />} />
                      {/* The five tabs that are not Home. Shop, Birb and Raid
                          are sections of one page, one screen each, so the bar
                          can lead somewhere specific. */}
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
                      <Route path="/activities/support" element={<SupportPage />} />
                      <Route path="/activities/first-aid" element={<FirstAidPage />} />
                      <Route path="/activities" element={<ActivitiesPage />} />
                      <Route path="/shop" element={<ShopPage />} />
                      <Route path="/friends" element={<FriendsPage />} />
                      {/* No /bag of its own: `main` grew AssetsPage, which is the
                          same idea done properly, so the Bag tab points there.
                          Colours and companions sit on Birb, next to the house;
                          wearing gear is the Bag's slot grid.

                          The raid left: the sheet, the boss and the adventures
                          are one subject and now have one screen, so /birb is
                          the bird and the room it lives in. */}
                      <Route path="/birb" element={<ShopPage only={['colours', 'house', 'companions']} title="Birb" />} />
                      <Route path="/raid" element={<ShopPage only={['raid']} title="Raid" />} />
                      {/* The everything view went when each of its sections had a
                          home of its own. Kept as a redirect, like /cycle, for
                          the links and home screens that still carry it. */}
                      <Route path="/party" element={<Navigate to="/shop" replace />} />
                      <Route path="/eve-garden" element={(
                        <Suspense fallback={<p className="section-sub">Opening the garden…</p>}>
                          <EveGardenPage />
                        </Suspense>
                      )}
                      />
                      <Route path="/overworld" element={(
                        <Suspense fallback={<p className="section-sub">Opening the garden…</p>}>
                          <OverworldPage />
                        </Suspense>
                      )}
                      />
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
                      {/* Not a redirect. `<Navigate to="/" />` sent an unknown
                          hash silently home, which reads as the app having
                          swallowed the tap rather than as the address being
                          wrong — and it hid every typo'd deep link from a
                          notification instead of reporting one. */}
                      <Route path="*" element={<RouteNotFound />} />
                    </Routes>
                  </ErrorBoundary>
                </PairGate>
              </FirstRunGate>
            </main>
            {/* Inside the router so its "open Settings" link works, but outside
                <main> so it survives every route change — the thread should not
                reset because she looked at the calendar mid-sentence. A thread with
                one end is not a thread, so it waits for the pairing. */}
            {paired ? <ChatPanel badges={badges} /> : null}
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
            {/* The opposite corner to the menu button, and the same reasoning as
                the bar below: shown while unpaired too. Level and coins are this
                phone's own — a solo first run earns and spends both — so there is
                nothing here that waits on a second person. */}
            <StatusHud />
            <BottomNav locked={ready && !paired} badges={badges.byRoute} />
          </ToastHost>
        </HashRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
