/**
 * How far the couple have got through Eve's Garden.
 *
 * One row per couple, and deliberately tiny: an island number, how many of its
 * seven stages are cleared, and the ids of the monsters that have fallen. The
 * stage *contents* — monsters, stats, the type chart — live in C# under
 * `game/`, and nothing about them is stored. A row here says where you are, not
 * what is there.
 *
 * That split is what lets Island 2 ship as a data change with no migration: the
 * stored row for a couple standing on island 1 is identical before and after.
 *
 * Pure. Dexie lives in `db/repository/world.ts`.
 */

import type { CoupleId } from '../types';

/** Seven, and the same for every island. Mirrors `Island.StagesPerIsland` in C#. */
export const STAGES_PER_ISLAND = 7;

/** Five, and the same list as `World.Islands` in C#. */
export const ISLAND_COUNT = 5;

/**
 * Which face of an island is showing.
 *
 * Not a difficulty the player picks — it is read off the couple's recent
 * logging by `diorama.ts`. The strings match the C# `DioramaTheme` enum, which
 * crosses the wasm boundary as its PascalCase spelling.
 */
export type DioramaTheme = 'Light' | 'Dark';

export interface WorldProgress {
  /** Primary key. The world belongs to the couple, not to either of them. */
  coupleId: CoupleId;
  /** Which island they are on, 1-based. */
  island: number;
  /**
   * Monster ids that have fallen, across every island.
   *
   * Ids rather than a count, because a count cannot survive an island being
   * re-tuned and cannot answer "have we beaten this one before". They are
   * stable strings authored in `Data/Island1.cs` (`i1s3-snooze-thistle`), so a
   * row written today still reads correctly after island 2 ships.
   */
  cleared: string[];
  /** Last-write time. The holdings sync compares these, so it must be set on every write. */
  updatedAt: number;
}

export function newWorldProgress(coupleId: CoupleId, at: number): WorldProgress {
  return { coupleId, island: 1, cleared: [], updatedAt: at };
}

/** Monster ids follow `i<island>s<stage>-<name>`, which is what makes this readable. */
export function islandOfMonster(monsterId: string): number | undefined {
  const match = /^i(\d+)s\d+-/.exec(monsterId);
  return match ? Number(match[1]) : undefined;
}

export function stageOfMonster(monsterId: string): number | undefined {
  const match = /^i\d+s(\d+)-/.exec(monsterId);
  return match ? Number(match[1]) : undefined;
}

export function clearedOn(progress: WorldProgress, island: number): string[] {
  return progress.cleared.filter((id) => islandOfMonster(id) === island);
}

export function clearedCount(progress: WorldProgress, island: number): number {
  return clearedOn(progress, island).length;
}

/**
 * The stage they are standing on, 1-based and clamped to the island's last.
 *
 * Derived from the clear list rather than stored, so the two can never
 * disagree. Mirrors `World.CurrentStage` in C#.
 */
export function currentStage(progress: WorldProgress, island = progress.island): number {
  return Math.min(STAGES_PER_ISLAND, Math.max(1, clearedCount(progress, island) + 1));
}

/** How far through an island they are, in [0, 1]. What the compass bar draws. */
export function islandProgress(progress: WorldProgress, island = progress.island): number {
  return Math.min(1, Math.max(0, clearedCount(progress, island) / STAGES_PER_ISLAND));
}

export function isIslandComplete(progress: WorldProgress, island: number): boolean {
  return clearedCount(progress, island) >= STAGES_PER_ISLAND;
}

/**
 * An island is unlocked once the one before it is finished. Island 1 always is.
 *
 * This is the only gate in the world, on purpose: the alternative — a level
 * requirement — would let a couple who logged plenty and fought little find
 * themselves locked out of the thing the logging was for.
 */
export function isIslandUnlocked(progress: WorldProgress, island: number): boolean {
  // Bounds first. `island <= 1` alone read island 0 — and every negative
  // number — as unlocked, which let `travelTo` strand the couple on an island
  // that has no stages and no way back.
  if (island < 1 || island > ISLAND_COUNT) return false;
  if (island === 1) return true;
  return isIslandComplete(progress, island - 1);
}

/**
 * Record a win.
 *
 * Idempotent, which is the property that matters: both phones see the same
 * victory and both will write it, and the row then syncs by last-write-wins.
 * Clearing a stage twice has to be the same row, or the partner's copy would
 * disagree about how far along they are.
 *
 * Returns the same object when nothing changed, so callers can skip the write
 * and the live query behind it.
 */
export function clearStage(
  progress: WorldProgress,
  monsterId: string,
  at: number,
): WorldProgress {
  if (progress.cleared.includes(monsterId)) return progress;

  const cleared = [...progress.cleared, monsterId];
  const island = islandOfMonster(monsterId) ?? progress.island;
  const next: WorldProgress = { ...progress, cleared, updatedAt: at };

  // Finishing an island moves them to the next one, if there is a next one.
  // Staying put on a finished island would leave the compass reading 7/7 with
  // nothing to walk towards.
  const finished = clearedOn(next, island).length >= STAGES_PER_ISLAND;
  if (finished && island === progress.island && island < ISLAND_COUNT) {
    return { ...next, island: island + 1 };
  }
  return next;
}

/**
 * Move to an island the couple have unlocked. Refuses anything else by
 * returning the row untouched, so the world map can call it on any tap.
 */
export function travelTo(progress: WorldProgress, island: number, at: number): WorldProgress {
  if (island === progress.island) return progress;
  if (!isIslandUnlocked(progress, island)) return progress;
  return { ...progress, island, updatedAt: at };
}
