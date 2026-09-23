import { ISLAND_COUNT, isIslandComplete, isIslandUnlocked, standingIsland, type WorldProgress } from '../../domain/rpg/world';
import { bossOf, faceOf } from '../../domain/rpg/islands';
import type { IslandDto } from './engine/types';

/**
 * All seven islands, who waits at the top of each, and which you may walk to.
 *
 * Opens from the compass. An island you have not reached still gets its name
 * and its boss here rather than a gap, so the shape of the whole climb is
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
            const here = standingIsland(progress) === island.number;
            const name = dark ? island.darkName : island.lightName;
            const boss = faceOf(bossOf(island.number), dark).name;

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
                  disabled={!unlocked}
                  onClick={() => onTravel(island.number)}
                >
                  <span className="garden-map-number">{island.number}</span>
                  <span className="garden-map-name">
                    {name}
                    <span className="garden-map-note">
                      {!unlocked
                        ? `Finish island ${island.number - 1} first.`
                        : complete
                          ? 'Cleared.'
                          : here
                            ? 'You are here.'
                            : 'Open.'}
                      {' '}Boss: {boss}.
                    </span>
                  </span>
                  <span className="garden-map-element">{island.element}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <p className="garden-map-foot">
          Each island answers to one thing. Morning Meadow gives way to movement,
          Focus Falls to study; log it today and every monster there feels it.
          The last two answer to the two of you together.
        </p>
      </div>
    </div>
  );
}
