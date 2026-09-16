// Runs Lighthouse against a production build served by `vite preview`, and
// asserts the precache budget the service worker actually shipped.
//
// Usage: node app/tools/lighthouse.mjs
//
// ## Never the dev server
//
// `vite.config.ts` sets `devOptions: { enabled: false }`, so there is no
// service worker in dev at all — a Lighthouse run against `npm run dev` would
// score an app that is not the app, report no offline capability, and measure
// unminified modules served one per import. `vite preview` serves `dist`, which
// is the thing Cloudflare Pages will serve.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'app', 'dist');

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('app/dist is not built. Run `APP_BASE=/ npm run build` first.');
  process.exit(1);
}

// ---- the precache budget ----------------------------------------------------
/**
 * What the service worker will actually download on install.
 *
 * Read off the built `sw.js` rather than out of a comment. The comment in
 * `vite.config.ts` stated this twice and disagreed with itself — "twelve
 * entries at 882 KB" at :67 and "19 entries / ~946 KiB" at :100 — while the
 * build printed 20 entries at 1041.60 KiB. That is what a budget written in
 * prose does, and it is the reason this is arithmetic.
 *
 * The ceiling is a *ceiling*, not a pin. A pin fails on every legitimate
 * addition and gets raised without being read; a ceiling with headroom stated
 * in the failure message is a number somebody has to think about.
 */
const PRECACHE_CEILING_ENTRIES = 24;
const PRECACHE_CEILING_KIB = 1200;

const sw = await readFile(join(DIST, 'sw.js'), 'utf8');
const manifest = [...sw.matchAll(/"revision":\s*(?:"[^"]*"|null),\s*"url":\s*"([^"]+)"/g)]
  .map((m) => m[1]);

if (manifest.length === 0) {
  // Workbox's injection point is a literal array; if the shape changes this
  // finds nothing and would otherwise pass a budget check on zero entries.
  check('precache manifest is readable from sw.js', false,
    'no entries matched — the injectManifest output shape changed');
} else {
  let bytes = 0;
  for (const url of manifest) {
    const file = join(DIST, url.replace(/^\//, '').split('?')[0]);
    try { bytes += (await readFile(file)).byteLength; } catch { /* generated */ }
  }
  const kib = Math.round(bytes / 1024);
  console.log(`\n  precache: ${manifest.length} entries, ${kib} KiB`);

  check(`precache is at most ${PRECACHE_CEILING_ENTRIES} entries`,
    manifest.length <= PRECACHE_CEILING_ENTRIES,
    `${manifest.length} entries — every phone downloads all of them on install`);
  check(`precache is at most ${PRECACHE_CEILING_KIB} KiB`,
    kib <= PRECACHE_CEILING_KIB,
    `${kib} KiB`);

  // The two chunks vite.config.ts names in `globIgnores`, checked here rather
  // than trusted there. Phaser is over a megabyte and the .NET worker chunk is
  // 300 KB; either one entering the precache doubles a cold install for the
  // phones that never open Eve's Garden.
  const leaked = manifest.filter((u) => /phaser-|game\.worker-/.test(u));
  check('neither phaser nor the game worker is precached', leaked.length === 0,
    leaked.join(', '));
  const wasm = manifest.filter((u) => u.endsWith('.wasm'));
  check('no .wasm is precached', wasm.length === 0, `${wasm.length} found`);
}

// ---- lighthouse -------------------------------------------------------------
const preview = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], {
  cwd: join(ROOT, 'app'), stdio: 'ignore',
});
process.on('exit', () => preview.kill());

// Poll rather than sleep a fixed time: a fixed wait is either flaky or slow,
// and on a cold CI runner it is both.
const url = 'http://127.0.0.1:4174/';
let up = false;
for (let i = 0; i < 40 && !up; i++) {
  try { up = (await fetch(url)).ok; } catch { await new Promise((r) => setTimeout(r, 250)); }
}
if (!up) { console.error('vite preview never came up'); preview.kill(); process.exit(1); }

const { default: lighthouse } = await import('lighthouse');
const { chromium } = await import('playwright');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

// Lighthouse drives Chrome over the DevTools protocol, so it needs a browser
// with a remote debugging port rather than a playwright page.
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox', '--remote-debugging-port=9222'],
});

const result = await lighthouse(url, {
  port: 9222,
  output: 'json',
  logLevel: 'error',
  // Mobile, because that is the only device this app is used on. A desktop
  // run would report a performance number nobody will ever experience.
  formFactor: 'mobile',
  screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false },
  onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
});

await browser.close();
preview.kill();

/**
 * Floors, not targets.
 *
 * Performance is the lowest because the number that dominates it here is the
 * main bundle — 811 KB before gzip, one eagerly-loaded SPA — and dropping that
 * is a code-splitting project, not a guardrail. The floor exists to catch a
 * *regression*, and it should be raised as the real score rises rather than
 * set aspirationally and muted on the first failure.
 *
 * Accessibility is the highest because axe already walks every screen in
 * `visual.mjs`; a Lighthouse a11y score below this would mean something got
 * past both.
 */
const FLOORS = { performance: 0.55, accessibility: 0.95, 'best-practices': 0.9, seo: 0.9 };

console.log('');
for (const [id, floor] of Object.entries(FLOORS)) {
  const score = result.lhr.categories[id].score;
  check(`${id} ${(score * 100).toFixed(0)} >= ${(floor * 100).toFixed(0)}`, score >= floor);
}

console.log(`\n${failed === 0 ? 'PASS' : `FAIL (${failed})`}`);
process.exit(failed === 0 ? 0 : 1);
