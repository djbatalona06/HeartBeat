import { isReady, type GameMethod, type GameRequest, type GameResponse } from './protocol';
import type {
  Activity, AwardDto, BattleDto, DioramaTheme, ProgressDto, StageDto, WorldDto,
} from './types';

/**
 * The page's handle on the game worker.
 *
 * One promise per call, matched by a monotonic id. Nothing here is clever: the
 * worker answers every request exactly once, so the pending map only ever grows
 * by one and shrinks by one.
 *
 * `close()` rejects everything still outstanding rather than leaving those
 * promises to hang forever. That matters because the page tears the worker down
 * on unmount, and a half-finished fight's `act()` would otherwise keep a
 * component's `setState` alive past its own lifetime.
 */

export interface GameClient {
  /** Resolves once the runtime has booted and answered a ping. */
  ready(): Promise<void>;
  world(): Promise<WorldDto>;
  stage(island: number, stage: number, theme: DioramaTheme): Promise<StageDto | null>;
  beginBattle(
    island: number, stage: number, theme: DioramaTheme, level: number, seed: number,
  ): Promise<BattleDto | null>;
  act(battle: BattleDto, actionId: string): Promise<BattleDto | null>;
  monsterMove(battle: BattleDto): Promise<BattleDto | null>;
  progress(xp: number): Promise<ProgressDto>;
  award(activity: Activity, currentXp: number): Promise<AwardDto>;
  defeatXp(island: number, stage: number): Promise<number>;
  close(): void;
}

/**
 * The C# side takes `int`, and JavaScript numbers are doubles.
 *
 * Anything outside int32 fails at the interop marshaller rather than in managed
 * code, so it arrives as an unreadable string and looks like the whole runtime
 * failed to boot. Clamping here means no caller can produce that: an XP total
 * larger than int32 is already far past the top of the curve, and
 * `Progression.LevelForXp` clamps to max level anyway.
 */
const INT32_MAX = 2147483647;

function asInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-INT32_MAX, Math.min(INT32_MAX, Math.trunc(value)));
}

class ClosedError extends Error {
  constructor() {
    super('the game worker was closed');
    this.name = 'ClosedError';
  }
}

/** True for the rejection `close()` produces, so callers can ignore their own teardown. */
export function isClosed(error: unknown): boolean {
  return error instanceof Error && error.name === 'ClosedError';
}

export function createGameClient(): GameClient {
  // `new URL(..., import.meta.url)` with `{ type: 'module' }` is the spelling
  // Vite compiles into a real worker chunk. A bare path would be fetched at
  // runtime and 404 in production, where the file is hashed.
  const worker = new Worker(new URL('./game.worker.ts', import.meta.url), { type: 'module' });

  const pending = new Map<number, { resolve(value: unknown): void; reject(error: unknown): void }>();
  let nextId = 1;
  let closed = false;

  let markReady: () => void;
  let failReady: (error: unknown) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    markReady = resolve;
    failReady = reject;
  });

  worker.addEventListener('message', (event: MessageEvent<GameResponse | { ready: true }>) => {
    if (isReady(event.data)) {
      markReady();
      return;
    }
    const response = event.data as GameResponse;
    const waiting = pending.get(response.id);
    if (!waiting) return;
    pending.delete(response.id);
    if (response.ok) waiting.resolve(response.value);
    else waiting.reject(new Error(response.error));
  });

  // A worker that fails to load never sends anything, so without this the
  // readiness promise and every call behind it would hang rather than fail.
  worker.addEventListener('error', (event: ErrorEvent) => {
    const error = new Error(event.message || 'the game worker failed to start');
    failReady(error);
    for (const waiting of pending.values()) waiting.reject(error);
    pending.clear();
  });

  function send<T>(method: GameMethod, ...args: unknown[]): Promise<T> {
    if (closed) return Promise.reject(new ClosedError());
    const id = nextId++;
    const request: GameRequest = { id, method, args };
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage(request);
    });
  }

  /**
   * The C# side answers `null` for anything that does not exist — an unbuilt
   * island, a malformed state — rather than throwing across the boundary, where
   * an exception arrives as an unreadable string. So `null` is a value here,
   * not an error.
   */
  async function json<T>(method: GameMethod, ...args: unknown[]): Promise<T | null> {
    const text = await send<string | null>(method, ...args);
    return text === null ? null : (JSON.parse(text) as T);
  }

  return {
    ready: () => readyPromise,

    async world() {
      return (await json<WorldDto>('world'))!;
    },

    stage: (island, stage, theme) => json<StageDto>('stage', island, stage, theme),

    // `seed` is deliberately not clamped: it crosses as a double, which is what
    // `Api.ToSeed` expects and folds into a uint itself.
    beginBattle: (island, stage, theme, level, seed) =>
      json<BattleDto>('beginBattle', island, stage, theme, asInt(level), seed),

    // The battle state is handed straight back as the string it arrived as
    // would be cheaper, but re-serialising keeps `BattleDto` the only thing the
    // page ever holds — there is no second, stringly-typed copy to get stale.
    act: (battle, actionId) => json<BattleDto>('act', JSON.stringify(battle), actionId),

    monsterMove: (battle) => json<BattleDto>('monsterMove', JSON.stringify(battle)),

    async progress(xp) {
      return (await json<ProgressDto>('progress', asInt(xp)))!;
    },

    async award(activity, currentXp) {
      return (await json<AwardDto>('award', activity, asInt(currentXp)))!;
    },

    defeatXp: (island, stage) => send<number>('defeatXp', island, stage),

    close() {
      if (closed) return;
      closed = true;
      const error = new ClosedError();
      failReady(error);
      for (const waiting of pending.values()) waiting.reject(error);
      pending.clear();
      worker.terminate();
    },
  };
}
