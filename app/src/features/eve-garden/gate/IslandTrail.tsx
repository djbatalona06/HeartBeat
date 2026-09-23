import { ISLANDS } from '../../../domain/rpg/islands';
import {
  isIslandComplete, isIslandUnlocked, standingIsland, type WorldProgress,
} from '../../../domain/rpg/world';

/**
 * All seven islands, in a line, at the top of the gate.
 *
 * Read-only on purpose: the map in the garden is where you travel. This is the
 * shape of the whole climb, visible before the first fight — which ones are
 * behind you, which one you are standing on, and how far the last one is.
 */
export function IslandTrail({ world, dark }: { world: WorldProgress; dark: boolean }) {
  const here = standingIsland(world);
  return (
    <ol className="gate-trail" aria-label="The seven islands">
      {ISLANDS.map((island) => {
        const done = isIslandComplete(world, island.number);
        const open = isIslandUnlocked(world, island.number);
        const name = dark ? island.darkName : island.lightName;
        const state = island.number === here ? 'here' : done ? 'done' : open ? 'open' : 'locked';
        return (
          <li
            key={island.number}
            className="gate-trail-step"
            data-state={state}
            aria-current={state === 'here' ? 'step' : undefined}
          >
            <span className="gate-trail-dot" aria-hidden="true">
              {done ? '✓' : island.number}
            </span>
            <span className="gate-trail-name">
              {name}
              <span className="visually-hidden">
                {state === 'here' ? ', you are here' : state === 'done' ? ', cleared' : state === 'locked' ? ', locked' : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
