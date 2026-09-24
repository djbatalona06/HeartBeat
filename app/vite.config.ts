import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import DotnetWasm from 'unplugin-dotnet-wasm/vite';

// Cloudflare Pages serves from the root of its subdomain. The service worker's
// scope must match the base path exactly or registration fails silently on iOS,
// so anything hosting this under a subpath has to set APP_BASE to match.
const BASE = process.env.APP_BASE ?? '/';

// Eve's Garden's rules live in C# (`game/`), compiled to WebAssembly and run in
// a Web Worker. This plugin does not invoke MSBuild — it reads an output that
// must already exist, so `npm run game:build` has to have run first. The npm
// `build` script chains them; CI does the same. A missing output is a build
// error rather than a silent no-op, which is the whole reason the boot config
// is pinned to `WasmBundlerFriendlyBootConfig` in the csproj.
//
// Debug/Release pairs with build/publish: the publish layout is the trimmed one
// and it is the only layout small enough to ship.
const DOTNET_RELEASE = process.env.NODE_ENV !== 'development';

const dotnetWasm = () =>
  DotnetWasm({
    projectName: 'HeartBeat.Game.Wasm',
    projectRoot: '../game/HeartBeat.Game.Wasm',
    configuration: DOTNET_RELEASE ? 'Release' : 'Debug',
    targetFramework: 'net10.0',
    isPublish: DOTNET_RELEASE,
    logLevel: 'warn',
  });

export default defineConfig({
  base: BASE,
  // The .NET runtime is imported by `engine/game.worker.ts`, and Vite bundles
  // a worker in its own Rollup pass that does NOT inherit the plugins above.
  // Without this the build fails at `_framework/dotnet.js` with "no known
  // conditions" — Vite falling back to resolving the plugin's type-only shim
  // package as if it were a real dependency.
  worker: {
    format: 'es',
    plugins: () => [dotnetWasm()],
  },
  build: {
    rollupOptions: {
      output: {
        // Pin Phaser to a predictable filename so the precache ignore above can
        // name it. The dynamic import in `features/rpg` splits it out either
        // way, but into a chunk named after whichever module imported it — a
        // name that changes the next time a file is renamed, which is worse
        // than no exception at all.
        //
        // Rollup's CommonJS helpers get their own chunk. Phaser is CommonJS, so
        // without this Rollup parks `getDefaultExportFromCjs` and
        // `commonjsGlobal` inside the phaser chunk, and the entry — which needs
        // them for its own CJS dependencies — imports the whole 1.4 MB engine
        // to reach two one-liners. The precache ignores that chunk, so offline
        // the entry's graph cannot resolve and the app boots to a blank page.
        manualChunks: (id) => {
          if (id.includes('node_modules/phaser')) return 'phaser';
          if (id.includes('commonjsHelpers')) return 'cjs-helpers';
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    dotnetWasm(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Phaser is over a megabyte, and it belongs to exactly one screen. The
        // precache is the app's cold-start budget — twelve entries at 882 KB —
        // and everything in it is something the app is actually for: the log,
        // the bird, the day. Letting the game engine in would make every phone
        // pay for the overworld on install, including the phones that never
        // open it. So the chunk is named below and ignored here.
        //
        // The consequence, stated rather than discovered: the overworld needs
        // one online visit before it works offline. Nothing else changes.
        // Workbox's default 2 MiB size limit would NOT have caught this —
        // minified Phaser is under it and would have been swallowed silently.
        //
        // The .NET runtime is the same judgement call made twice. It is 3.5 MB
        // raw / ~1.04 MB brotli — on its own larger than the entire precache
        // above — and like Phaser it belongs to exactly one screen. Letting it
        // in would more than double what every phone downloads on install,
        // including the phones that never open Eve's Garden.
        //
        // Roughly a fifth of that is System.Text.Json, which the boundary in
        // `game/HeartBeat.Game.Core/Api.cs` needs. It is source-generated
        // rather than reflective precisely so the linker can drop the rest of
        // it; see the trimming switches in HeartBeat.Game.Wasm.csproj.
        //
        // Same consequence, stated the same way: Eve's Garden needs one online
        // visit before it works offline.
        //
        // Only one pattern is needed, and it is not the obvious one. The
        // `.wasm` payloads are already out because `globPatterns` above never
        // listed `wasm` — so the thing that actually leaks is
        // `game.worker-*.js`, the worker chunk, which has the runtime's three
        // loader scripts bundled into it and weighs 300 KB on its own. Naming
        // the `.wasm` files here would look like the fix and change nothing.
        //
        // Check this with `npm run build` and read the entry count. It sits at
        // 19 entries / ~946 KiB: the page chunks either garden splits out
        // (EveGardenPage, bake, zones, the two `game` bootstraps) are a few KB
        // each and belong in the precache, because they are what renders the
        // "needs one online visit" message when the heavy parts are missing.
        // The two that must never appear are named below.
        globIgnores: [
          'assets/phaser-*.js',
          'assets/game.worker-*.js',
          // The per-pack headline faces, ~160 KiB together. Cached on first
          // use by `pwa/sw.ts` instead; see the @font-face note in styles.css.
          'fonts/display/**',
        ],
      },
      manifest: {
        id: BASE,
        name: 'HeartBeat',
        short_name: 'HeartBeat',
        description: 'A gamified life tracker for two people.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#2a0f1c',
        theme_color: '#2a0f1c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
});
