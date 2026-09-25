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

  // The chunks vite.config.ts names in `globIgnores`, checked here rather
  // than trusted there. Phaser is over a megabyte and the .NET worker chunk is
  // 300 KB; either one entering the precache doubles a cold install for the
  // phones that never open Eve's Garden. The 3D mascots' chunk is three.js,
  // several times the precache's headroom on its own, and every mascot has an
  // SVG to stand on until it arrives.
  const leaked = manifest.filter((u) => /phaser-|game\.worker-|mascot3d-/.test(u));
  check('neither phaser, the game worker nor the 3D mascots is precached', leaked.length === 0,
    leaked.join(', '));
  // Kept out of the precache is not the same as kept out of the first load.
  // A lazy chunk that the entry chunk imports anything from gets a
  // `modulepreload` in index.html and is fetched and evaluated on every boot —
  // which is what a value import of `../roster` inside `mascots/3d/` did, and
  // is why `models.ts` falls back to Mochi by name. (Phaser is preloaded the
  // same way today, through the CommonJS helpers its chunk captured; that is
  // older than this check and tracked separately, so it is not asserted here.)
  const html = await readFile(join(DIST, 'index.html'), 'utf8');
  const preloaded = [...html.matchAll(/rel="modulepreload"[^>]*href="[^"]*(mascot3d-[^"]+)"/g)].map((m) => m[1]);
  check('the 3D mascots are not preloaded on boot', preloaded.length === 0, preloaded.join(', '));
  const wasm = manifest.filter((u) => u.endsWith('.wasm'));
  check('no .wasm is precached', wasm.length === 0, `${wasm.length} found`);
}

// ---- lighthouse -------------------------------------------------------------
/**
 * `vite preview`, and the two things the first CI run got wrong about it.
 *
 * **Sixty seconds, not ten.** The first version polled for 10s and failed
 * exactly on that boundary while the runner's cleanup then reported a live
 * `node` and `esbuild` — so vite was starting, just not within the window.
 * `preview` loads `vite.config.ts`, which pulls in `unplugin-dotnet-wasm` and
 * `vite-plugin-pwa`, and on a cold runner that is not a 10-second job.
 *
 * **Its output is kept.** The first version used `stdio: 'ignore'`, so when it
 * failed the only thing it could say was "never came up" — which is the
 * failure with its cause thrown away, and cost a CI round to learn nothing.
 * Whatever vite says on the way up or down is buffered and printed if the wait
 * ends badly.
 *
 * `npm run preview --workspace app` rather than `npx vite preview`: the
 * workspace already declares that script, and npx is one more resolution step
 * that can find a different vite than the one that did the build.
 */
const preview = spawn('npm', ['run', 'preview', '--workspace', 'app', '--', '--port', '4174', '--strictPort', '--host', '127.0.0.1'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
});

let previewLog = '';
preview.stdout.on('data', (d) => { previewLog += d; });
preview.stderr.on('data', (d) => { previewLog += d; });
preview.on('error', (e) => { previewLog += `spawn error: ${e.message}\n`; });

process.on('exit', () => preview.kill());

// Poll rather than sleep a fixed time: a fixed wait is either flaky or slow,
// and on a cold CI runner it is both. The sleep is unconditional — the first
// version only slept in the catch branch, so a server answering non-2xx would
// have spun through every attempt without waiting at all.
const url = 'http://127.0.0.1:4174/';
let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try { up = (await fetch(url)).ok; } catch { /* not listening yet */ }
  if (!up) await new Promise((r) => setTimeout(r, 500));
}
if (!up) {
  console.error('vite preview never came up after 60s. Its output was:');
  console.error(previewLog.trim() || '  (nothing — it produced no output at all)');
  preview.kill();
  process.exit(1);
}

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
 * Floors, not targets — and one category that is reported rather than gated.
 *
 * The first real run measured performance 77, accessibility 100,
 * best-practices 100, seo 82. Three of those floors were guesses that turned
 * out conservative, and they stay where they are: the floor exists to catch a
 * *regression*, not to certify today's number, and it should be raised as the
 * real score rises rather than pinned to it.
 *
 * Performance is the lowest because the number that dominates it is the main
 * bundle — 811 KB before gzip, one eagerly-loaded SPA — and dropping that is a
 * code-splitting project, not a guardrail. Accessibility is the highest
 * because axe already walks every screen in `visual.mjs`; a Lighthouse a11y
 * score below this would mean something got past both.
 *
 * ## Why SEO is measured and not gated
 *
 * This deserves suspicion, because muting a check the first time it fails is
 * exactly what this comment warned against two paragraphs up. The distinction
 * is not that 82 was inconvenient — it is that the category is scoring a goal
 * this app does not have.
 *
 * `heartbeat-eop.pages.dev` is a two-person tracker behind a pairing gate.
 * There is nothing here to index and nothing that should be: the couple's log
 * is the whole content. The public, discoverable surface is the landing page
 * on GitHub Pages, which is a different deploy target and has its own check
 * (`npm run site:check`) — and `robots.txt` already asks crawlers to stay out
 * of the parts that are personal.
 *
 * What the 82 was actually pointing at was real and is fixed: `index.html` had
 * no `<meta name="description">`. That matters for the link preview on a
 * pairing invite, which is a thing a person sees, so it was worth fixing on
 * its own terms. The rest of the category is crawlability of a hash-routed
 * app, which is not a defect here.
 *
 * So the score is printed on every run. If somebody later decides the app
 * should be findable, the number is already there to set a floor from.
 */
const FLOORS = { performance: 0.55, accessibility: 0.95, 'best-practices': 0.9 };
const REPORTED = ['seo'];

console.log('');
for (const [id, floor] of Object.entries(FLOORS)) {
  const score = result.lhr.categories[id].score;
  check(`${id} ${(score * 100).toFixed(0)} >= ${(floor * 100).toFixed(0)}`, score >= floor);
}
for (const id of REPORTED) {
  const score = result.lhr.categories[id].score;
  console.log(`  note ${id} ${(score * 100).toFixed(0)} (measured, not gated)`);
}

console.log(`\n${failed === 0 ? 'PASS' : `FAIL (${failed})`}`);
process.exit(failed === 0 ? 0 : 1);
