import { ISLAND_COUNT, STAGES_PER_ISLAND } from '../../domain/rpg/world';

/**
 * Where you are, in one chip.
 *
 * Top-left of the garden, over the canvas. It is the only navigation Eve's
 * Garden has — tapping it opens the world map — so it carries the island name,
 * the stage, and a bar that fills as stages fall.
 */

export interface CompassProps {
  islandNumber: number;
  islandName: string;
  stage: number;
  /** 0-1. */
  progress: number;
  dark: boolean;
  onOpenMap(): void;
}

export function Compass({
  islandNumber, islandName, stage, progress, dark, onOpenMap,
}: CompassProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <button
      type="button"
      className={`garden-compass${dark ? ' is-dark' : ''}`}
      onClick={onOpenMap}
      aria-label={`Island ${islandNumber} of ${ISLAND_COUNT}, ${islandName}, stage ${stage} of ${STAGES_PER_ISLAND}. Open the map.`}
    >
      <span className="garden-compass-rose" aria-hidden="true">✳</span>
      <span className="garden-compass-text">
        <span className="garden-compass-where">
          {islandName}
          <span className="garden-compass-stage">
            {' · '}
            Stage {stage}/{STAGES_PER_ISLAND}
          </span>
        </span>
        <span className="garden-compass-bar">
          <span className="garden-compass-fill" style={{ width: `${percent}%` }} />
        </span>
      </span>
      <span className="garden-compass-percent">{percent}%</span>
    </button>
  );
}
