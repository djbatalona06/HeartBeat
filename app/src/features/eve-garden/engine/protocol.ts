/**
 * The messages between the page and the game worker.
 *
 * Shared by both sides so a renamed method is a compile error rather than a
 * promise that never settles.
 */

import type { DioramaTheme } from './types';

export type GameMethod =
  | 'ping'
  | 'world'
  | 'stage'
  | 'beginBattle'
  | 'act'
  | 'monsterMove'
  | 'progress'
  | 'award'
  | 'defeatXp';

export interface GameRequest {
  /** Matches a reply to its caller. Monotonic per client. */
  id: number;
  method: GameMethod;
  args: readonly unknown[];
}

export type GameResponse =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };

/** Sent unprompted once the runtime has booted, so the client can stop waiting. */
export interface GameReady {
  id: 0;
  ready: true;
}

export function isReady(data: unknown): data is GameReady {
  return typeof data === 'object' && data !== null && (data as GameReady).ready === true;
}

export interface StageRef {
  island: number;
  stage: number;
  theme: DioramaTheme;
}
