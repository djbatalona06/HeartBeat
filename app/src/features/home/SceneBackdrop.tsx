import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { db } from '../../db/database';
import { coupleVitals, gardenMomentum } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { levelForXp } from '../../domain/xp';
import { RADIANCE_FULL } from '../../domain/rpg/vitals';
import type { Garden } from '../../domain/rpg/plots';
import { ThemeBackdrop, useTheme } from '../../themes/ThemeProvider';
import { GardenBackdrop } from '../eve-garden/GardenBackdrop';
import { useHour } from './useHour';

/**
 * The one thing painted behind everything, and the only thing.
 *
 * ## The conflict this settles
 *
 * `<ThemeBackdrop />` used to sit outside `<HashRouter>`, painting the active
 * pack's canvas under every screen in the app. Putting the couple's garden on
 * the home screen would have meant a second fixed, full-viewport layer at the
 * same depth, and two of those is not a design — it is whichever one the
 * stacking order happens to favour, plus a canvas running a paint loop
 * underneath something nobody can see it through.
 *
 * So the slot moved inside the router and became a switch. Exactly one backdrop
 * exists at a time, and which one is a question about the route rather than a
 * question about z-index.
 *
 * ## Why home gets the real garden and not a drawing of one
 *
 * `GardenBackdrop` is already an SVG with no canvas in it, every fill a custom
 * property, and it already reads the couple's own plots, their tether and the
 * hour. Home does not get a decorative garden that resembles theirs; it gets
 * *theirs*, so planting something in Eve's Garden changes what the home screen
 * looks like. That is the whole point of the screen — the pet is the product —
 * and it is the reason this is a promotion of existing code rather than a new
 * illustration.
 *
 * The canvas rule in the brief stands: Phaser stays in the Garden and the
 * Overworld, and nothing here boots an engine.
 */
export function SceneBackdrop() {
  const { pathname } = useLocation();
  // Only the home screen. Every other route keeps the pack canvas it has always
  // had, including the garden itself — `EveGardenPage` draws its own backdrop
  // inside the stage, and a second one behind the page would be the same
  // doubling this component exists to prevent.
  return pathname === '/' ? <HomeGarden /> : <ThemeBackdrop />;
}

/**
 * The couple's garden, full-bleed, behind the home screen.
 *
 * ## The reads, and the duplication that is accepted here
 *
 * Three of these queries also run in `DashboardPage`, which renders below this
 * in the tree and so cannot hand anything up to it. Hoisting them into a
 * context to share would put the whole home screen's data in the shell for the
 * benefit of one background, which is a worse trade than two point lookups and
 * one aggregate running twice on a single route.
 *
 * The raw settings row rather than `loadSettings()`, for the reason `ToastHost`
 * gives: that merges defaults on every read, and calling it inside a live query
 * triggers a sync rewrite that re-fires the query up to twenty times per
 * foreground cycle. See CLAUDE.md.
 */
function HomeGarden() {
  const { mode, calm } = useTheme();
  const { hour, phase } = useHour();

  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  // The dye, for the big tree's canopy. One more point lookup on a route that
  // already runs three -- see the note above about the duplication accepted
  // here -- and it is what lets the tree match the bird standing in front of
  // it. `DashboardPage` reads the same row for the mascot itself.
  const avatar = useLiveQuery(
    () => (settings?.memberId ? db.avatars.get(settings.memberId) : undefined),
    [settings?.memberId],
  );

  const vitals = useLiveQuery(() => coupleVitals(day), [day]);
  const momentum = useLiveQuery(() => gardenMomentum(day), [day]);
  const pet = useLiveQuery(
    () => (settings?.coupleId ? db.pet.get(settings.coupleId) : undefined),
    [settings?.coupleId],
  );

  // The same reading the garden page takes, and for the same reason it is read
  // rather than stored: a tether that only ever went up would stop meaning
  // anything, and one that punished a quiet week would be the cron damage this
  // app was shaped to make impossible. It fills the fountain and nothing else.
  const resonance = Math.min(1, Math.max(0, 1 - (momentum?.daysSinceLog ?? 0) / 7));

  return (
    <div
      className="home-scene"
      data-phase={phase}
      data-calm={calm ? 'true' : 'false'}
      aria-hidden="true"
    >
      <GardenBackdrop
        hour={hour}
        dark={mode === 'dark'}
        // Radiance decides the weather and the warmth, never the difficulty —
        // a hard week brings soft rain and a cooler light, and that is all it
        // ever does. The default sits above the rain threshold so a couple who
        // has logged nothing yet is met with a clear morning rather than a
        // downpour on their first launch.
        mood={vitals ? vitals.radiance / RADIANCE_FULL : 0.6}
        resonance={resonance}
        garden={(pet?.plots ?? {}) as Garden}
        fit="ground"
        petLevel={levelForXp(pet?.xp ?? 0)}
        dye={avatar?.dye}
      />
      {/* The ground under the words.
          Top and bottom only, fading out through the middle: the page header
          and the tab bar are the two places bare text meets the scene, and the
          cards between them carry their own surface. A flat scrim over the
          whole viewport would have been simpler and would have thrown away the
          garden to protect text that was never at risk.
          `themes/veil.test.ts` is what says this is enough. */}
      <div className="home-scene-veil" />
    </div>
  );
}
