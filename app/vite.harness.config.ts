import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The third build: `overworld:harness`, a dev-only page that mounts the
 * garden with no first-run or pairing gate in front of it. See `src/harness.tsx`
 * for why it exists.
 *
 * Its own config, on the `vite.standalone.config.ts` pattern, so a dev
 * dependency of a dev tool can never reach `vite.config.ts` and therefore
 * never reach `dist/` or the service-worker manifest.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-harness',
    emptyOutDir: true,
    rollupOptions: { input: 'harness.html' },
  },
});
