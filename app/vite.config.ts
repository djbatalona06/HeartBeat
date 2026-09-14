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

export default defineConfig({
  base: BASE,
  build: {
    rollupOptions: {
      output: {
        // Pin Phaser to a predictable filename so the precache ignore above can
        // name it. The dynamic import in `features/rpg` splits it out either
        // way, but into a chunk named after whichever module imported it — a
        // name that changes the next time a file is renamed, which is worse
        // than no exception at all.
        manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  plugins: [
    react(),
    DotnetWasm({
      projectName: 'HeartBeat.Game.Wasm',
      projectRoot: '../game/HeartBeat.Game.Wasm',
      configuration: DOTNET_RELEASE ? 'Release' : 'Debug',
      targetFramework: 'net10.0',
      isPublish: DOTNET_RELEASE,
      logLevel: 'warn',
    }),
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
        // visit before it works offline. The runtime is emitted under
        // `assets/` with content hashes by the plugin, so both the `.wasm`
        // payloads and the loader chunks are named here.
        globIgnores: [
          'assets/phaser-*.js',
          'assets/dotnet*',
          'assets/*.wasm',
          'assets/System.*',
          'assets/HeartBeat.Game.Wasm*',
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
