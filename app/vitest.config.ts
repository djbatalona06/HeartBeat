import { defineConfig } from 'vitest/config';

export default defineConfig({
  // No `@vitejs/plugin-react` here on purpose. Its job is Fast Refresh, which
  // a test run has no use for, and Vite's own esbuild transform already reads
  // the `jsx` setting out of tsconfig and compiles `.tsx` without it. Adding
  // the plugin also fails `tsc` outright: vitest 2 bundles its own Vite types
  // and the plugin is typed against the workspace's Vite 6, so the two
  // `Plugin` types do not unify.
  test: {
    /**
     * Node stays the default, and that is not a leftover.
     *
     * 2164 of the tests in this repo are pure domain rules that touch no DOM.
     * Running those in jsdom means constructing a document per file for tests
     * that never look at one, which is most of a second per file and the
     * reason the original config said `.ts` only.
     *
     * So the environment is chosen per file rather than globally: a component
     * test opts into jsdom with an `@vitest-environment jsdom` docblock, and
     * everything else keeps node. A domain test that accidentally starts
     * depending on a DOM fails in node, which is the right answer — that is
     * the layering rule in docs/DESIGN.md enforced by the test runner instead
     * of by review.
     *
     * The docblock rather than `environmentMatchGlobs`: that option is
     * deprecated in Vitest 3 and removed in 4, and this config's whole job is
     * to survive the version bumps that keep the toolchain out of `npm audit`.
     */
    environment: 'node',

    /**
     * `.tsx` joins `.ts`, which reverses a deliberate decision.
     *
     * The old comment read: "component tests would drag in a DOM environment
     * for very little." That was true when the only thing worth asserting
     * about a component was that React rendered it. It stopped being true when
     * the component library grew rules of its own — a sheet that traps focus,
     * a primary action that distinguishes busy from disabled, a pane budget.
     * Those are behaviours, they are not visible to `veil.test.ts` or to a
     * screenshot, and a screenshot that could see them could not say why they
     * were wrong.
     *
     * The rule that replaced it: **a `.test.tsx` earns its place by asserting
     * behaviour a screenshot cannot.** Rendering a component to check it
     * renders is not that, and belongs in the visual walk instead.
     */
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
  },
});
