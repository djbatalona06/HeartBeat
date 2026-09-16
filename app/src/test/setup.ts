/**
 * Runs before every test file, in both environments.
 *
 * It has to be safe under `environment: 'node'` as well as jsdom, because the
 * domain tests load it too — so everything here is guarded on there being a
 * document rather than assuming one.
 */
import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  // Testing Library's auto-cleanup only registers itself when the test globals
  // are on, and they are off here (no `globals: true`), so the unmount is
  // explicit. Without it every render in a file stacks into the same body and
  // a `getByRole` that should match once matches four times.
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => { cleanup(); });

  // jsdom implements neither, and both are read by code under test: the shell
  // measures its own scroll against the viewport, and the theme engine asks
  // whether the person has asked for less motion.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
}
