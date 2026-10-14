import { useMemo } from 'react';
import { BOARD_KITS, type BoardKitId } from '../../../domain/rpg/boards';
import type { ArenaCssTokens } from '../../pet/mascots/3d/arenaPalette';
import { drawKitSwatch } from '../arenaCanvas';
import { floorCacheKey } from '../arenaFloor';

/**
 * Choose how the battle board looks, on the Raid Gate beside the companion pick.
 *
 * The companion already decides the board's colours, so this is the one place
 * both are chosen and the previews wear the ringed companion's pack. A look only,
 * never a stat: it changes nothing about the fight. Plain buttons in a group, so
 * it is reachable by keyboard and each one announces whether it is on.
 *
 * Imports nothing three.js: the gate renders before the engine is loaded, and the
 * previews are flat 2D swatches from `arenaCanvas.ts`.
 */

export interface BoardPickerProps {
  kit: BoardKitId;
  /** The ringed companion's colours, in the current light/dark mode. */
  tokens: ArenaCssTokens;
  onPick(kit: BoardKitId): void;
}

export function BoardPicker({ kit, tokens, onPick }: BoardPickerProps) {
  const key = floorCacheKey(tokens);
  // Redrawn only when the colours change, not on every render of the gate.
  const swatches = useMemo(
    () => new Map(BOARD_KITS.map((k) => [k.id, drawKitSwatch(k.id, tokens)] as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the five colours, which is all a swatch reads
    [key],
  );

  return (
    <div className="board-picker" role="group" aria-label="Choose a board">
      <h2 className="board-picker-title">Board</h2>
      <div className="board-picker-list">
        {BOARD_KITS.map((k) => {
          const src = swatches.get(k.id);
          return (
            <button
              key={k.id}
              type="button"
              className="board-picker-kit"
              aria-pressed={k.id === kit}
              onClick={() => onPick(k.id)}
            >
              {src ? <img className="board-picker-swatch" src={src} alt="" aria-hidden="true" /> : null}
              <span className="board-picker-name">{k.name}</span>
              <span className="board-picker-blurb">{k.blurb}</span>
            </button>
          );
        })}
      </div>
      <p className="board-picker-note">Seen in 3D. With Calm or Save-Data on, the board stays flat.</p>
    </div>
  );
}
