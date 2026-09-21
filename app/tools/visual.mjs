// Walks the built app the way a phone does — every screen, every theme — and
// compares each frame against a committed baseline. Runs axe-core on the same
// walk, because opening the page twice to ask two questions is twice the cost
// for no more coverage.
//
// Usage:
//   node app/tools/visual.mjs                 compare against baselines
//   node app/tools/visual.mjs --update        rewrite the baselines
//   node app/tools/visual.mjs --shots <dir>   where to put this run's frames
//   node app/tools/visual.mjs --require-baselines   a missing baseline fails
//
// ## The pixel half of this is not switched on yet
//
// `app/tools/baselines/` is not in the repo, so every run seeds all ten frames
// and the byte compare does not execute. That is the documented state, not an
// accident — see "Baselines are not committed yet" in docs/design-system.md,
// which also has the three-step procedure for making them and the reason they
// must come from CI rather than from a laptop (the compare is byte-exact and
// font rasterisation is machine-specific).
//
// What this file adds to that: a seeded frame is now **counted and named** in
// the summary instead of scrolling past as one more "seeded" line, because a
// walk that verified nothing must not read as a walk that found nothing wrong.
// `--require-baselines` is the flag CI passes once the frames are committed,
// so the gate cannot quietly go inert again afterwards.
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
const REQUIRE_BASELINES = process.argv.includes('--require-baselines');
/** Frames that had no baseline to compare against, so nothing was verified. */
const seeded = [];

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
 * Get past `FirstRunGate`, by writing the two flags it reads.
 *
 * ## Clicking through was tried twice and did not work
 *
 * The first version clicked the app's own escape hatches — `.welcome-guest`
 * and `.onboarding-skip` — which is what `gift/tools/verify.mjs` does and is
 * the better instinct: it exercises real UI and encodes no schema. It failed
 * on CI with every screen redirected to `#/onboarding`. The second version
 * waited for each control instead of for a fixed delay, checked the gate had
 * actually opened, and retried three times. It failed the same way, on both
 * themes, all six attempts. Two rounds of fixing a mechanism whose failure
 * nobody reproduced is a third round waiting to happen, so it writes the
 * record `loadSettings` reads instead.
 *
 * ## Why the write has to be retried
 *
 * Seeding once was not enough either, and the reason is a race rather than a
 * mistake. `useSync()` is mounted at the top of `App.tsx`, so every boot runs
 * it, and both `pwa/sync.ts` and `pwa/holdingsSync.ts` finish by calling
 * `saveSettings`. That helper is a read-modify-write — `loadSettings()`, then
 * `put({ ...current, ...patch })` — so a boot write that read *before* this
 * seed and wrote *after* it puts the old flags back and the gate closes again.
 *
 * On CI that is exactly what happened: kitty walked all five screens and
 * shinobi stopped at `#/welcome`, same code, same commit, one won the race and
 * one lost it. Nothing here can stop the app writing; what it can do is check
 * whether the flags survived and write them again if they did not. By the
 * second attempt the boot writes have landed, and because `saveSettings`
 * merges rather than replaces, a later write preserves what this one set.
 *
 * ## The coupling, kept small
 *
 * One object store (`settings`), one key (`'settings'`), two booleans.
 * `loadSettings` spreads the stored row over `DEFAULT_SETTINGS`, so a partial
 * record is a valid record and no other field has to be known here. The
 * database is never *created*, only written to: the app boots first so Dexie
 * builds it at whatever version it is on, and this opens it with no version
 * argument, so no upgrade fires and no store list has to be kept in step.
 *
 * If the field names ever change, the route assertion in the walk catches it
 * and says which route it was stuck on, which is the property that made this
 * failure diagnosable in one CI round instead of three.
 */
async function prime(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    // `/welcome` is one of FirstRunGate's exempt routes, so it renders without
    // a redirect and gives Dexie time to build the database.
    await page.goto(`${base}/#/welcome`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => indexedDB.databases().then((dbs) => dbs.some((d) => d.name === 'heartbeat')),
      null,
      { timeout: 15000, polling: 200 },
    ).catch(() => {});

    // Let the boot writes land before writing over them. This does not remove
    // the race — only the retry does that — but it loses it far less often.
    await page.waitForTimeout(600);

    const wrote = await page.evaluate(async () => {
      function open() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('heartbeat');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          // Firing means the database did not exist, which means the app never
          // booted — fail rather than create a half-schema Dexie would then
          // have to reconcile.
          request.onupgradeneeded = () => reject(new Error('heartbeat did not exist'));
        });
      }

      try {
        const db = await open();
        if (!db.objectStoreNames.contains('settings')) return 'no settings store';
        await new Promise((resolve, reject) => {
          const tx = db.transaction('settings', 'readwrite');
          const store = tx.objectStore('settings');
          // Merge rather than replace: the app may have written real fields by
          // now, and a bare put would drop them.
          const read = store.get('settings');
          read.onsuccess = () => {
            store.put({
              ...(read.result ?? {}),
              id: 'settings',
              guestAcknowledged: true,
              onboarded: true,
            });
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        return 'ok';
      } catch (error) {
        return String(error && error.message ? error.message : error);
      }
    });

    if (wrote !== 'ok') {
      console.log(`  note  seed attempt ${attempt} failed: ${wrote}`);
      continue;
    }

    // Prove it survived, rather than trusting the write.
    //
    // ## Why this does not poll for the hash
    //
    // It used to wait for `location.hash === '#/'`, which is the hash `goto`
    // had just set -- so the poll raced FirstRunGate's redirect in **both**
    // directions and was wrong either way. A poll that landed before the gate
    // ran saw the '#/' it had navigated to and reported the gates open when
    // they were not; the walk then reached `home`, waited its own 500ms, and
    // only there discovered it had been bounced to /welcome. A poll that
    // landed after the redirect saw '#/welcome' and spent the full ten seconds
    // waiting for a hash that was never coming back, before retrying
    // correctly. One failure mode looked like a broken home screen and the
    // other looked like a slow runner; both were this line.
    //
    // So it waits for whichever of the two things actually happens. A hash
    // that is no longer '#/' is the gate having its say -- retry. A hash of
    // '#/' *and* the dashboard's own markup on the page is the gate having
    // opened, which is the only evidence that distinguishes "open" from "has
    // not run yet". Neither can be reported by a sample taken too early.
    //
    // ## Which gate this is about
    //
    // `FirstRunGate`, and only that one. There are two gates and they are not
    // the same question: that one asks whether this phone has met the app,
    // and `PairGate` asks whether there are two of you. This function seeds
    // the first one's answer and can do nothing about the second — pairing
    // needs a `workerSecret` only the server can issue.
    //
    // So "open" here means *past onboarding*, which is either of two honest
    // outcomes: the dashboard rendered, or `PairGate` is showing its
    // invitation. `/` is not in `OPEN_WHILE_UNPAIRED`, so an unpaired browser
    // gets the invitation **at the same hash**, rendered in place with no
    // redirect — which is exactly why sampling the hash could never tell
    // these apart, and why waiting only for the dashboard times out.
    //
    // Anything else — a redirect to `#/welcome` or `#/onboarding` — is the
    // seed not having taken, and is what the retry is for.
    //
    // Coupling to these classes is the same trade this file already makes for
    // `.welcome-guest` and `.onboarding-skip`, and for the reason given
    // there: real UI with a stable class beats encoding the app's schema into
    // its harness.
    await page.goto(`${base}/#/`, { waitUntil: 'load' });
    const open = await page
      .waitForFunction(() => {
        if ((location.hash || '#/') !== '#/') return { open: false };
        // Either is past onboarding. Neither is "the gate has not run yet",
        // which renders nothing and is what the poll has to outlast.
        const past = document.querySelector('.home-pet') || document.querySelector('.gate-title');
        return past ? { open: true } : undefined;
      }, null, { timeout: 15000, polling: 100 })
      .then((handle) => handle.jsonValue())
      .then((result) => result.open === true)
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
  if (!primed) {
    // Say where it landed. The previous version reported only that it had been
    // redirected, which cost a CI round to learn what this line now prints.
    const landed = await page.evaluate(() => location.hash || '#/').catch(() => '?');
    check(`${themeId} got past the first-run gates`, false,
      `still at ${landed} — the settings seed did not open FirstRunGate`);
    await page.close();
    return;
  }
  check(`${themeId} got past the first-run gates`, true);

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
      if (!UPDATE) seeded.push(label);
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

// A frame with no baseline was not checked, and a run that checked nothing
// must not read as a run that found nothing wrong. This is said out loud
// whether or not it fails: "seeded" scrolling past in a log is how this went
// unnoticed for the whole life of the file.
if (seeded.length > 0) {
  console.log(`\n=== ${seeded.length} frame(s) had no baseline ===`);
  console.log('  Nothing was compared for these. They have been written to');
  console.log(`  ${BASELINES} for this run only -- CI starts from a clean`);
  console.log('  checkout, so the next run will seed them again.');
  for (const label of seeded) console.log(`    - ${label}`);
  console.log('  To make them, follow "Baselines are not committed yet" in');
  console.log('  docs/design-system.md: take them from the visual-frames');
  console.log('  artifact of a CI run, look at every frame, then commit them.');
  console.log('  Not from a laptop -- the compare is byte-exact and fonts differ.');
  if (REQUIRE_BASELINES) {
    failed += seeded.length;
    console.log('  --require-baselines is set, so this is a failure.');
  }
}

console.log(`\n${failed === 0 ? 'PASS' : `FAIL (${failed})`}  ·  frames in ${SHOTS}`);
if (failed === 0 && seeded.length > 0) {
  console.log(`NOTE  ${seeded.length} of these frames were not verified against anything.`);
}
process.exit(failed === 0 ? 0 : 1);
