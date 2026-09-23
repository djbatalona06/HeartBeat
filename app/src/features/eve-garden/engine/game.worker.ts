/// <reference lib="webworker" />

/**
 * The .NET runtime, kept off the main thread.
 *
 * Booting Mono and running a fight are both cheap enough to do inline — this is
 * arithmetic over a few dozen integers, not a physics solve. The worker is here
 * for the *boot*, not the maths: loading and instantiating 3.5 MB of WebAssembly
 * blocks whatever thread does it for a noticeable beat on a mid-range phone, and
 * on the main thread that beat lands on the first frame of Eve's Garden, which
 * is exactly when someone is watching.
 *
 * Everything past boot is a plain request/response pair. There is no state here
 * beyond the runtime handle: `Api` on the C# side is stateless by design, so a
 * worker that dies mid-fight costs the fight and nothing else, and the page can
 * simply make a new one.
 */

import { dotnet } from '_framework/dotnet.js';
import type { GameRequest, GameResponse } from './protocol';

/** The shape `getAssemblyExports` hands back for `Bridge.cs`. */
interface BridgeExports {
  Ping(value: number): number;
  World(): string;
  Stage(island: number, stage: number, theme: string): string | null;
  BeginBattle(
    island: number, stage: number, theme: string, level: number, seed: number,
    charges: string, statsJson: string,
  ): string | null;
  Act(battleJson: string, actionId: string): string | null;
  MonsterMove(battleJson: string): string | null;
  Progress(xp: number): string;
  Award(activity: string, currentXp: number): string;
  DefeatXp(island: number, stage: number): number;
}

let bridge: BridgeExports | null = null;

async function boot(): Promise<BridgeExports> {
  const runtime = await dotnet
    // The runtime's own unhandled-error handling calls `exit`, which in a
    // worker means the worker is gone and every pending promise hangs. We
    // would rather a thrown call reject its own request and leave the runtime
    // standing, which is what the try/catch around `call` is for.
    .withExitOnUnhandledError()
    .create();

  // The export tree is dynamic, so the shape is asserted here — once — and then
  // proven a line later: if the assertion is wrong, `found` is undefined or
  // `Ping` is not a function, and both are caught below rather than surfacing as
  // a confusing failure on the first real call.
  const exports = await runtime.getAssemblyExports(
    runtime.getConfig().mainAssemblyName!,
  ) as { HeartBeat?: { Game?: { Wasm?: { Bridge?: BridgeExports } } } } | undefined;

  const found = exports?.HeartBeat?.Game?.Wasm?.Bridge;
  if (!found) throw new Error('the game assembly exported no Bridge');

  // The readiness check, and the reason `Ping` outlived the build gate it was
  // written for: it proves the interop layer marshals in both directions, not
  // merely that the module instantiated.
  if (found.Ping(41) !== 42) throw new Error('the game bridge did not answer');
  return found;
}

function call(api: BridgeExports, method: GameRequest['method'], args: readonly unknown[]): unknown {
  switch (method) {
    case 'ping': return api.Ping(args[0] as number);
    case 'world': return api.World();
    case 'stage': return api.Stage(args[0] as number, args[1] as number, args[2] as string);
    case 'beginBattle':
      return api.BeginBattle(
        args[0] as number, args[1] as number, args[2] as string,
        args[3] as number, args[4] as number,
        args[5] as string, args[6] as string,
      );
    case 'act': return api.Act(args[0] as string, args[1] as string);
    case 'monsterMove': return api.MonsterMove(args[0] as string);
    case 'progress': return api.Progress(args[0] as number);
    case 'award': return api.Award(args[0] as string, args[1] as number);
    case 'defeatXp': return api.DefeatXp(args[0] as number, args[1] as number);
    // The switch is exhaustive over `GameMethod`, so this is unreachable from
    // the typed client — and reachable from a message that simply says
    // `method: 'whatever'`. Without it that message is answered `ok: true` with
    // an undefined value, which is a worse thing to debug than a rejection.
    default: throw new Error(`unknown method: ${String(method)}`);
  }
}

// Requests can arrive before the runtime has finished booting — the page mounts
// and asks for the world immediately — so they queue behind the same promise
// rather than racing it or being dropped.
const ready = boot().then((api) => {
  bridge = api;
  self.postMessage({ id: 0, ready: true });
  return api;
});

/**
 * Nothing but a well-formed request is answered.
 *
 * `call()` returns `undefined` for a method it does not know, so a malformed
 * message used to come back as a perfectly cheerful `{ ok: true, value:
 * undefined }` — a reply the client cannot tell from a real one.
 *
 * It is also the honest answer to CodeQL's `js/missing-origin-check` on the
 * handler below, which is a false positive and is dismissed as one in the
 * Security tab. That query is written for `window.addEventListener('message')`,
 * where a message really can arrive from any page. This is a **dedicated**
 * worker: its port is held by the one document that constructed it and by
 * nothing else, and the `origin` on a message from that document is the empty
 * string — so an origin check here would compare against nothing and refuse
 * nothing. What can actually be wrong is the *shape* of what arrives, so that
 * is what is checked.
 */
function isRequest(data: unknown): data is GameRequest {
  const candidate = data as Partial<GameRequest> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.id === 'number' &&
    typeof candidate.method === 'string' &&
    Array.isArray(candidate.args)
  );
}

self.addEventListener('message', (event: MessageEvent<GameRequest>) => {
  if (!isRequest(event.data)) return;
  const { id, method, args } = event.data;

  const reply = (response: GameResponse) => self.postMessage(response);

  const run = (api: BridgeExports) => {
    try {
      reply({ id, ok: true, value: call(api, method, args) });
    } catch (error) {
      // A throw from managed code arrives as a string of stack. Forwarding it
      // as a rejection keeps one bad call from taking down every later one.
      reply({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  if (bridge) run(bridge);
  else ready.then(run, (error: unknown) => reply({
    id,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
});
