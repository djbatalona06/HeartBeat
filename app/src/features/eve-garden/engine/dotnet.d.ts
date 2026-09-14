/**
 * The type of the .NET WebAssembly runtime's entry module.
 *
 * `_framework/dotnet.js` is not a package and not a file in this repository. It
 * is a virtual module that `unplugin-dotnet-wasm` resolves at bundle time to the
 * published runtime under `game/HeartBeat.Game.Wasm/bin/`.
 *
 * The plugin also *generates* a type shim for it, into `app/node_modules/
 * _framework/`, as a side effect of running. That is why this file has to
 * exist: the shim appears the first time Vite runs and not before, so on a clean
 * checkout `npm run typecheck` — which runs before any build — fails with
 * TS2307. It passed on this machine only because a build had already happened
 * here. CI, starting from nothing, is what found it.
 *
 * So the declaration is owned here instead of depended on. That also buys
 * something: the generated shim types every parameter as `any`, and this types
 * the four calls the worker actually makes. If the runtime's API changes under
 * us, this is where it is written down.
 */
declare module '_framework/dotnet.js' {
  interface DotnetRuntime {
    /**
     * One assembly's `[JSExport]` methods, as a namespace tree:
     * `HeartBeat.Game.Wasm.Bridge.Ping` arrives as
     * `exports.HeartBeat.Game.Wasm.Bridge.Ping`.
     *
     * Genuinely dynamic — the shape is whatever the assembly exported — so it
     * is `unknown` here and asserted once, at the single place that reads it,
     * where `Ping` then proves at runtime that the assertion held.
     */
    getAssemblyExports(assemblyName: string): Promise<unknown>;
    getConfig(): { mainAssemblyName?: string };
  }

  interface DotnetHostBuilder {
    /**
     * Route an unhandled managed error to the runtime's own exit path. In a
     * worker that means the worker is gone, so `game.worker.ts` also wraps every
     * call — see the try/catch around `call` there.
     */
    withExitOnUnhandledError(): DotnetHostBuilder;
    withDiagnosticTracing(enabled: boolean): DotnetHostBuilder;
    withConfig(config: Record<string, unknown>): DotnetHostBuilder;
    create(): Promise<DotnetRuntime>;
    run(): Promise<number>;
  }

  export const dotnet: DotnetHostBuilder;
  export function exit(code: number, reason?: unknown): void;
}
