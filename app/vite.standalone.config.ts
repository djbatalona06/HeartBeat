import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The second build: `app/study.html` into one bundle, for `scripts/build-study.mjs`
 * to inline into a single file.
 *
 * Three deliberate differences from `vite.config.ts`. There is no PWA plugin,
 * because a file with no origin cannot register a service worker and one that
 * tried would only log an error. Nothing is code-split, because a dynamic
 * import in a file:// page has no URL to fetch from. And `assetsInlineLimit` is
 * infinite so anything Vite does handle becomes a data URI here rather than a
 * dangling reference the build script would have to catch later.
 *
 * Relative base for the same reason: an absolute `/assets/...` is wrong the
 * moment the file is opened from a folder rather than a server.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
    rollupOptions: {
      input: 'study.html',
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'study.js',
        assetFileNames: 'study.[ext]',
      },
    },
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    // The whole point is one readable artefact; a sourcemap would either be a
    // second file or triple the size of the first.
    sourcemap: false,
    target: 'es2020',
  },
});
