import { ISLAND_COUNT, isIslandComplete, isIslandUnlocked, type WorldProgress } from '../../domain/rpg/world';
import type { IslandDto } from './engine/types';

/**
 * All five islands, and which of them you may walk to.
 *
 * Opens from the compass. An island that has no stages authored yet still gets
 * a name and a row here rather than a gap — `World.Islands` on the C# side
 * carries the names for exactly that reason, so the shape of the world is
 * visible from the first island.
 */

export interface WorldMapProps {
  islands: IslandDto[];
  progress: WorldProgress;
  dark: boolean;
  onTravel(island: number): void;
  onClose(): void;
}

export function WorldMap({ islands, progress, dark, onTravel, onClose }: WorldMapProps) {
  return (
    <div className="garden-map-backdrop" role="dialog" aria-modal="true" aria-label="The world">
      <div className="garden-map">
        <header className="garden-map-head">
          <h2>Eve&rsquo;s Garden</h2>
          <button type="button" className="garden-map-close" onClick={onClose} aria-label="Close the map">
            ×
          </button>
        </header>

        <ol className="garden-map-list">
          {islands.slice(0, ISLAND_COUNT).map((island) => {
            const unlocked = isIslandUnlocked(progress, island.number);
            const complete = isIslandComplete(progress, island.number);
            const here = progress.island === island.number;
            const name = dark ? island.darkName : island.lightName;

            return (
              <li key={island.number}>
                <button
                  type="button"
                  className={[
                    'garden-map-island',
                    here ? 'is-here' : '',
                    unlocked ? '' : 'is-locked',
                    complete ? 'is-done' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={!unlocked || !island.built}
                  onClick={() => onTravel(island.number)}
                >
                  <span className="garden-map-number">{island.number}</span>
                  <span className="garden-map-name">
                    {name}
                    <span className="garden-map-note">
                      {!island.built
                        ? 'Still growing.'
                        : !unlocked
                          ? `Finish island ${island.number - 1} first.`
                          : complete
                            ? 'Cleared.'
                            : here
                              ? 'You are here.'
                              : 'Open.'}
                    </span>
                  </span>
                  <span className="garden-map-element">{island.element}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <p className="garden-map-foot">
          Each island answers to one thing. Morning Meadow gives way to movement;
          log a workout and its monsters feel it.
        </p>
      </div>
    </div>
  );
}
