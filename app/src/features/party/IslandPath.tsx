import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ISLANDS, type StageView } from '../../domain/rpg/islands';
import {
  STAGES_PER_ISLAND, currentStage, isIslandComplete, isIslandUnlocked, standingIsland,
  type WorldProgress,
} from '../../domain/rpg/world';
import { starCount, starMilestone, starState, type StarState } from '../../domain/rpg/starChests';
import { ChestArt } from '../chest/ChestArt';
import { Icon } from '../../components/icons';

/**
 * The Raid page's map: ten islands on one path, with the couple's real place on
 * it and a free star chest at every semi-boss and boss.
 *
 * Read from the world row and `domain/rpg/islands.ts` only, so it never boots
 * the WebAssembly runtime -- the same reason the Raid Gate reads the mirror.
 * The current island is open, showing its seven stages and a "You are here"
 * marker on the stage the couple actually stand on; every other island is one
 * row. Star chests show on every island, so one earned on an island already
 * passed is still there to open.
 */
export interface IslandPathProps {
  world: WorldProgress;
  /** This member's opened star chests (`Avatar.starChests`). */
  opened: readonly string[];
  busy: boolean;
  onOpenStar(monsterId: string): void;
}

export function IslandPath({ world, opened, busy, onOpenStar }: IslandPathProps) {
  const island = standingIsland(world);
  const stage = currentStage(world);
  const done = isIslandComplete(world, island);
  const stars = starCount(world.cleared);
  const here = useRef<HTMLLIElement | null>(null);

  // Later islands sit below the fold; bring the marker to the reader.
  useEffect(() => { here.current?.scrollIntoView?.({ block: 'nearest' }); }, [island]);

  const star = (s: StageView) => {
    const milestone = starMilestone(s.monsterId);
    if (!milestone) return null;
    const state: StarState = starState(s.monsterId, world.cleared, opened);
    const label = `${milestone.chestId === 'gilded' ? 'Boss' : 'Semi-boss'} star chest, ${
      state === 'ready' ? 'ready to open' : state === 'opened' ? 'opened' : `beat ${s.monster} to earn it`}`;
    return (
      <button
        key={`star-${s.monsterId}`}
        type="button"
        className="star-chest"
        data-state={state}
        data-chest={milestone.chestId}
        aria-label={label}
        title={label}
        disabled={state !== 'ready' || busy}
        onClick={() => onOpenStar(s.monsterId)}
      >
        <ChestArt id={milestone.chestId} />
        <span className="star-chest-badge" aria-hidden="true">★</span>
        {state === 'ready' && <span className="star-chest-cta">Open</span>}
      </button>
    );
  };

  return (
    <section className="panel island-path" aria-label="Island path">
      <header className="island-path-head">
        <span className="island-path-stars">★ {stars.earned} / {stars.total}</span>
        <span className="island-path-where">
          Island {island} · {done ? 'complete' : `Stage ${stage} of ${STAGES_PER_ISLAND}`}
        </span>
      </header>
      {/* First, so the one thing this page is for sits above the fold. */}
      <Link className="primary island-path-enter" to="/eve-garden">
        <Icon name="sword" /> Enter Eve&apos;s Garden
      </Link>

      <ol className="island-path-list">
        {ISLANDS.map((isl) => {
          const complete = isIslandComplete(world, isl.number);
          const current = isl.number === island;
          const open = isIslandUnlocked(world, isl.number);
          const state = current ? 'current' : complete ? 'done' : open ? 'open' : 'locked';
          return (
            <li key={isl.number} className="island-path-island" data-state={state}>
              <div className="island-path-row">
                <span className="island-path-num" aria-hidden="true">
                  {complete ? '✓' : open ? isl.number : <Icon name="shield" />}
                </span>
                <span className="island-path-name">
                  <span className="island-path-title">{isl.lightName}</span>
                  <span className="island-path-sub">{isl.element}{complete ? ' · cleared' : !open ? ' · locked' : ''}</span>
                </span>
                {!current && (
                  <span className="island-path-stars-row">
                    {isl.stages.map((s) => star(s))}
                  </span>
                )}
              </div>

              {current && (
                <ol className="island-path-stages">
                  {isl.stages.map((s) => {
                    const cleared = world.cleared.includes(s.monsterId);
                    const at = !done && s.number === stage;
                    return [
                      <li
                        key={s.monsterId}
                        ref={at ? here : undefined}
                        className="island-path-stage"
                        data-state={cleared ? 'cleared' : at ? 'here' : 'ahead'}
                        data-type={s.type}
                        aria-current={at ? 'step' : undefined}
                      >
                        <span className="island-path-dot" aria-hidden="true">{cleared ? '✓' : s.number}</span>
                        <span className="island-path-stage-name">
                          {s.name}
                          <span className="island-path-sub">
                            {s.type === 'Boss' ? 'Boss · ' : s.type === 'SemiBoss' ? 'Semi-boss · ' : ''}{s.monster}
                          </span>
                        </span>
                        {at && <span className="island-path-here">You are here</span>}
                      </li>,
                      starMilestone(s.monsterId) ? (
                        <li key={`slot-${s.monsterId}`} className="island-path-star-slot">{star(s)}</li>
                      ) : null,
                    ];
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>

    </section>
  );
}
