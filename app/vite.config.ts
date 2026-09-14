import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Cloudflare Pages serves from the root of its subdomain. The service worker's
// scope must match the base path exactly or registration fails silently on iOS,
// so anything hosting this under a subpath has to set APP_BASE to match.
const BASE = process.env.APP_BASE ?? '/';

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
        globIgnores: ['assets/phaser-*.js'],
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
