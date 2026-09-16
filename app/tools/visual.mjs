// Walks the built app the way a phone does — every screen, every theme — and
// compares each frame against a committed baseline. Runs axe-core on the same
// walk, because opening the page twice to ask two questions is twice the cost
// for no more coverage.
//
// Usage:
//   node app/tools/visual.mjs                 compare against baselines
//   node app/tools/visual.mjs --update        rewrite the baselines
//   node app/tools/visual.mjs --shots <dir>   where to put this run's frames
//
// Follows gift/tools/verify.mjs: raw `playwright`, its own `check()`, its own
// static server, and the sandbox's Chromium pinned by path. Deliberately not
// `@playwright/test` — the repo has one test runner (vitest) and a second one
// with its own config, reporters and assertion library is a second thing to
// learn for a walk that is ninety lines of imperative code.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'app', 'dist');
const BASELINES = join(ROOT, 'app', 'tools', 'baselines');
const shotArg = process.argv.indexOf('--shots');
const SHOTS = shotArg > -1 ? process.argv[shotArg + 1] : join(ROOT, '.shots', 'visual');
const UPDATE = process.argv.includes('--update');

mkdirSync(SHOTS, { recursive: true });
await mkdir(BASELINES, { recursive: true });

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('app/dist is not built. Run `APP_BASE=/ npm run build` first.');
  process.exit(1);
}

let failed = 0;
const problems = [];
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

// ---- the server -------------------------------------------------------------
// Same shape as gift/tools/check-landing.mjs. A file:// origin would work for
// the HTML but not for the service worker or the hashed module graph, and the
// app is a PWA — serving it over http is serving it the way it ships.
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  let file = join(DIST, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    // The app is a hash router, so every route is index.html. A 404 here would
    // mean the walk could only ever see the home screen.
    file = join(DIST, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- the browser ------------------------------------------------------------
// The sandbox ships a fixed Chromium that will not always match the playwright
// package's expected revision, so point at it explicitly rather than letting
// playwright resolve a version-stamped path it cannot find. Same list as
// gift/tools/verify.mjs; when that one moves, this one moves with it.
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox'],
});

const AXE = await readFile(join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

/**
 * The screens worth a picture, and why these.
 *
 * One per *shape* rather than one per route: the point is to catch a layout
 * that broke, and fourteen screens that share `Screen` + `TileCard` break
 * together. A route earns a frame by having a shape none of the others has.
 */
const SCREENS = [
  { name: 'home', hash: '#/' },
  { name: 'mood', hash: '#/mood' },
  { name: 'tasks', hash: '#/tasks' },
  { name: 'party', hash: '#/party' },
  { name: 'settings', hash: '#/settings' },
];

/**
 * Two, not five, and each pinned to a mode.
 *
 * The mode matters as much as the pack. `readStoredMode` in ThemeProvider.tsx
 * falls back to `'system'`, which resolves through `prefers-color-scheme` — so
 * an unpinned run screenshots whatever colour scheme the CI runner happens to
 * boot with, and the baselines flip the first time that image changes. Pinning
 * it also means the pair covers both sides of every mode-corrected token:
 * `--shadow` / `--shadow-color` have a separate light value, and
 * `--grain-opacity` is 3.5% against 5.5%.
 */
const THEMES = [
  { id: 'kitty', mode: 'light' },
  { id: 'shinobi', mode: 'dark' },
];

/**
 * Everything that moves, stopped.
 *
 * A screenshot of a breathing pet is a screenshot of wherever the pet happened
 * to be, and comparing two of those is comparing two moments. `data-calm` is
 * the app's own quiet switch and already stops the backdrop, the mascot and
 * the garden; this adds the blanket rule for anything that is not wired to it
 * yet, so a new animation cannot silently make the suite flaky.
 */
const FREEZE = `
  *, *::before, *::after {
    animation-play-state: paused !important;
    animation-delay: -1ms !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

/**
 * Click through `/welcome` and `/onboarding`, and prove the gate opened.
 *
 * Returns true once a plain `#/` stays at `#/`. Every step waits for the
 * element it is about to use rather than for a fixed number of milliseconds,
 * and the whole sequence repeats rather than being trusted once.
 */
async function prime(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    // `.welcome-guest` carries `disabled={busy}`, so wait for it to be enabled
    // rather than merely present — clicking a disabled button silently does
    // nothing, which is one of the ways the first run could have failed.
    await page.goto(`${base}/#/welcome`, { waitUntil: 'load' });
    const guest = await page
      .waitForSelector('.welcome-guest:not([disabled])', { timeout: 15000 })
      .catch(() => null);
    if (guest) await guest.click().catch(() => {});

    // `.onboarding-skip` renders on every step except the last, so it is there
    // on arrival. `finish()` awaits its own write before navigating, so once
    // the click lands the flag is set — the wait below is for the gate to
    // notice, not for the write.
    await page.goto(`${base}/#/onboarding`, { waitUntil: 'load' });
    const skip = await page
      .waitForSelector('.onboarding-skip', { timeout: 15000 })
      .catch(() => null);
    if (skip) await skip.click().catch(() => {});

    // The only question that matters: does a real route stay put.
    await page.goto(`${base}/#/`, { waitUntil: 'load' });
    const open = await page
      .waitForFunction(() => (location.hash || '#/') === '#/', null,
        { timeout: 8000, polling: 200 })
      .then(() => true)
      .catch(() => false);
    if (open) {
      if (attempt > 1) console.log(`  note  gates opened on attempt ${attempt}`);
      return true;
    }
  }
  return false;
}

async function walk({ id: themeId, mode }) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });

  page.on('console', (m) => {
    // A console error on a screen the user can reach is a failure whether or
    // not the picture changed.
    if (m.type() === 'error') problems.push(`[${themeId}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${themeId}] pageerror: ${e.message}`));

  // Belt and braces with the localStorage seed above: if site data is blocked
  // the seed silently no-ops, and this still pins the scheme the page resolves
  // `'system'` against.
  await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });

  // Seeded before the app boots, so the first paint is already the right theme
  // and calm is already on. Setting them afterwards would mean every frame
  // caught a transition from the default.
  await page.addInitScript(({ id, mode: m }) => {
    try {
      // The three keys ThemeProvider.tsx reads. Names, not guesses — see
      // STORAGE_KEY / MODE_KEY / CALM_KEY at the top of that file.
      localStorage.setItem('heartbeat.theme', id);
      localStorage.setItem('heartbeat.mode', m);
      localStorage.setItem('heartbeat.calm', 'true');
    } catch { /* private mode; the run still works, it just animates */ }
  }, { id: themeId, mode });

  // ---- past the two gates -------------------------------------------------
  // A browser that has never paired is redirected to /welcome and then to
  // /onboarding by FirstRunGate, so an unprimed walk screenshots the same
  // onboarding screen five times and calls it five baselines.
  //
  // Clicked through rather than faked, which is what gift/tools/verify.mjs
  // does and for the same reason: seeding Dexie from an init script means
  // encoding this app's schema into its test harness, and the schema is free
  // to change. The two escape hatches are real UI with stable classes —
  // `.welcome-guest` sets `guestAcknowledged`, `.onboarding-skip` calls
  // `finish()` which sets `onboarded`.
  //
  // ## Why this retries, and why it verifies rather than assuming
  //
  // The first CI run of this file failed with eight identical
  // "redirected to #/onboarding" lines. `guestAcknowledged` had taken and
  // `onboarded` had not, so the welcome click worked and the skip click did
  // not — a fixed `waitForTimeout` after `goto` is a bet that the page has
  // finished settling, and on a cold runner that bet loses. Both writes go
  // through Dexie and then have to reach a `useLiveQuery` before the gate
  // changes its mind, which is not a duration anybody can name in advance.
  //
  // So: wait for the control rather than for the clock, then *check the gate
  // actually opened* and try again if it did not. Three attempts, because the
  // failure mode is a race and a race that loses three times is a bug.
  const primed = await prime(page);
  check(`${themeId} got past the first-run gates`, primed,
    'still redirected after three attempts — FirstRunGate/PairGate did not open');
  if (!primed) { await page.close(); return; }

  for (const screen of SCREENS) {
    await page.goto(`${base}/${screen.hash}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Did the route stick, or did a gate bounce us? This is the difference
    // between a suite that guards the app and a suite that guards a picture of
    // the onboarding screen. It fails loudly rather than seeding a baseline of
    // the wrong thing, because a wrong baseline is worse than no baseline: it
    // passes forever and nobody looks at it again.
    const landed = await page.evaluate(() => location.hash || '#/');
    if (landed !== screen.hash) {
      check(`${themeId} ${screen.name} is reachable`, false,
        `redirected to ${landed} — the walk did not get past FirstRunGate/PairGate`);
      continue;
    }
    await page.addStyleTag({ content: FREEZE });
    await page.waitForTimeout(150);

    const label = `${themeId}-${mode}-${screen.name}`;
    const shot = join(SHOTS, `${label}.png`);
    await page.screenshot({ path: shot, fullPage: false });

    // ---- the comparison ----
    const baseline = join(BASELINES, `${label}.png`);
    if (UPDATE || !existsSync(baseline)) {
      await writeFile(baseline, await readFile(shot));
      console.log(`  ${UPDATE ? 'updated' : 'seeded '} ${label}`);
    } else {
      const [a, b] = [await readFile(baseline), await readFile(shot)];
      // A byte compare, not a perceptual one. Deliberate: every source of
      // jitter this walk could have — animation, caret, font loading, device
      // scale — is pinned above, so a differing byte means something actually
      // changed. A tolerance threshold here would be a place for a real
      // regression to hide, and pixelmatch is a dependency for a question
      // already answered.
      check(`${label} matches baseline`, a.equals(b),
        `${shot} differs; review it, then re-run with --update`);
    }

    // ---- axe, on the same visit ----
    await page.evaluate(AXE);
    const result = await page.evaluate(async () => {
      // Colour contrast is off here and not by oversight: `veil.test.ts`
      // already proves the scrim over the garden clears AA by compositing the
      // real tokens, and axe cannot see through a fixed backdrop to the ground
      // a card is actually sitting on — it would report the garden's own
      // gradient as a failure on every single frame.
      const run = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
        rules: { 'color-contrast': { enabled: false } },
      });
      return run.violations.map((v) => ({
        id: v.id, impact: v.impact, nodes: v.nodes.length,
        help: v.help, target: v.nodes[0]?.target?.join(' ') ?? '',
      }));
    });

    const serious = result.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    check(`${label} has no serious axe violations`, serious.length === 0,
      serious.map((v) => `${v.id} (${v.nodes}×) ${v.target}`).join('; '));
    // Moderate and minor are printed but do not fail: the difference between a
    // guardrail and a nuisance is whether it can be ignored honestly.
    for (const v of result.filter((x) => !serious.includes(x))) {
      console.log(`       note ${label}: ${v.id} — ${v.help}`);
    }
  }

  await page.close();
}

console.log(`\nserving app/dist at ${base}`);
for (const theme of THEMES) {
  // Two packs rather than all five. Every pack is the same markup with a
  // different set of custom properties, so a third would re-prove what the
  // second proved — while costing a fifth of the suite's runtime and five more
  // baseline PNGs in every review diff. Two because one cannot catch a rule
  // that hard-codes the pack that generated the baselines: kitty is light and
  // round, shinobi is dark and sharp, which is the widest gap the packs offer.
  console.log(`\n=== ${theme.id} · ${theme.mode} ===`);
  await walk(theme);
}

await browser.close();
server.close();

console.log('\n=== console errors ===');
if (problems.length) { problems.forEach((p) => console.log('  ' + p)); failed += problems.length; }
else console.log('  none');

console.log(`\n${failed === 0 ? 'PASS' : `FAIL (${failed})`}  ·  frames in ${SHOTS}`);
process.exit(failed === 0 ? 0 : 1);
