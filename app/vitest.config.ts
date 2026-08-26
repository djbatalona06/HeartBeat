import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only .ts, never .tsx: the domain layer is pure and worth testing, and
    // component tests would drag in a DOM environment for very little.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
