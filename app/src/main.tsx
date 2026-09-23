import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registration is hand-written and production-only: the dev server has no
// service worker, and registering one there caches stale modules for hours.
//
// ## Getting the new version onto the screen
//
// `sw.ts` skips waiting and claims the page, so a new worker takes over within
// seconds of a deploy -- but the page it takes over is still running the old
// bundle, and nothing reloaded it. An installed iPhone app is resumed rather
// than relaunched, so it could show last week's build for days after a deploy.
//
// So: ask for an update every time the app comes back to the foreground, and
// when a new worker takes control, reload -- at once if nobody has touched the
// page since it was shown, otherwise the next time it is hidden, so a
// half-typed entry is never thrown away under somebody's thumb.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let registration: ServiceWorkerRegistration | undefined;
  // The first install also fires `controllerchange`, and there is nothing
  // stale to replace then.
  let controlled = Boolean(navigator.serviceWorker.controller);
  let touched = false;
  let pending = false;
  const touch = () => { touched = true; };
  window.addEventListener('pointerdown', touch, { capture: true, passive: true });
  window.addEventListener('keydown', touch, { capture: true });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; }
    if (pending) return;
    pending = true;
    if (!touched || document.hidden) window.location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (pending) window.location.reload();
      return;
    }
    touched = false;
    registration?.update().catch(() => {});
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => { registration = reg; })
      .catch((err) => console.warn('service worker registration failed', err));
  });
}

// iOS evicts app storage under disk pressure. Asking to persist does not
// guarantee anything, but unasked-for storage is evicted first.
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((already) => {
    if (!already) navigator.storage.persist().catch(() => {});
  });
}
