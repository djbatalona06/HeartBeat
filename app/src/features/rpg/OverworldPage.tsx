import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings } from '../../db/database';
import { ensureIdentity, partyFor, type PartyRead, type VictoryReceipt } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { ZONES, zoneFor } from '../../domain/rpg/zones';
import { placeById } from '../../domain/rpg/locations';
import { levelOf } from '../../domain/rpg/avatar';
import { db } from '../../db/database';
import type { EncounterState } from '../../domain/rpg/encounter';
import type { OverworldHandle } from './overworld/game';
import { EncounterOverlay } from './EncounterOverlay';

/**
 * The garden.
 *
 * The only screen in the app that mounts a game engine, and the only dynamic
 * `import()` — Phaser is over a megabyte for one page, so it is fetched when
 * that page is opened and never otherwise. `vite.config.ts` names the chunk and
 * keeps it out of the service-worker precache; the visible consequence is that
 * this screen needs one online visit before it works offline, and nothing else
 * in the app changes.
 *
 * Three things in the mount below are easy to get wrong and all three cost a
 * phone real resources:
 *
 * - `live` guards the async race where the import resolves after unmount.
 *   Without it, React 18 StrictMode's double-mount leaves two canvases and two
 *   requestAnimationFrame loops running over each other.
 * - the handle is nulled on teardown, so a second cleanup is a no-op.
 * - teardown is `game.destroy(true)`, not `scene.stop()`. Leaving the WebGL
 *   context alive across route changes is how a phone runs out of contexts
 *   after half a dozen navigations.
 */
export function OverworldPage() {
  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<OverworldHandle | null>(null);

  const settings = useLiveQuery(loadSettings, []);
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const memberId = settings?.memberId ?? identity?.memberId;
  const coupleId = settings?.coupleId ?? identity?.coupleId;

  const avatar = useLiveQuery(
    () => (memberId ? db.avatars.get(memberId) : undefined),
    [memberId],
  );
  const level = avatar ? levelOf(avatar) : 1;

  const zone = zoneFor(ZONES[0]?.placeId);
  const place = placeById(zone?.placeId);
  const locked = place !== undefined && level < place.unlockLevel;

  // The party is read once, when a fight opens, rather than held live: a fight
  // is fought with the stats you walked in with, and a sync landing mid-round
  // should not change the numbers under you.
  const [pending, setPending] = useState<{ enemyId: string; party: PartyRead } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const onEncounter = useCallback((enemyId: string) => {
    if (!memberId || !coupleId) return;
    partyFor(memberId, coupleId, day)
      .then((party) => setPending({ enemyId, party }))
      .catch(() => {
        // Nothing to fight with is a reason to let the world run on, not to
        // leave it paused behind a panel that never opens.
        handle.current?.resume();
      });
  }, [memberId, coupleId, day]);

  const ready = Boolean(zone) && !locked;

  useEffect(() => {
    if (!ready || !zone || !host.current) return undefined;
    let live = true;
    import('./overworld/game')
      .then(({ startOverworld }) => {
        if (!live || !host.current) return;
        handle.current = startOverworld(host.current, zone, { onEncounter });
      })
      .catch(() => { if (live) setNote('The garden would not open. Try again in a moment.'); });

    return () => {
      live = false;
      handle.current?.destroy();
      handle.current = null;
    };
    // `onEncounter` is deliberately not a dependency: it closes over ids that
    // settle once, and rebuilding the whole game when it changes identity would
    // tear the canvas down mid-walk. The scene reads it through the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zone]);

  function closeEncounter(outcome: EncounterState['outcome'], _receipt: VictoryReceipt | null) {
    if (outcome === 'won' && pending) handle.current?.markCleared(pending.enemyId);
    setPending(null);
    handle.current?.resume();
  }

  return (
    <section className="page overworld">
      <header className="page-head">
        <h1>{place?.name ?? 'The garden'}</h1>
        <p className="page-sub">{place?.blurb ?? 'Out the window and back before lunch.'}</p>
      </header>

      {locked && place && (
        <p className="section-sub">Opens at level {place.unlockLevel}.</p>
      )}
      {note && <p className="section-sub">{note}</p>}

      {/* The canvas sits inside the page rather than fixed or portalled, so the
          tab bar, the status strip and the chat panel all keep working over it. */}
      <div className="overworld-stage" ref={host} aria-label="The garden" role="img" />

      <p className="section-sub overworld-hint">
        Arrow keys or WASD to walk. On a phone, tap a tile beside you. Walk into
        something to start a fight — and walking away from one costs nothing.
      </p>

      {pending && memberId && coupleId && (
        <EncounterOverlay
          enemyId={pending.enemyId}
          party={pending.party}
          memberId={memberId}
          coupleId={coupleId}
          day={day}
          onClose={closeEncounter}
        />
      )}
    </section>
  );
}
