// Two phones, one couple: the whole pairing flow, live, against the real code.
//
// Usage:
//   node app/tools/pair-live.mjs            needs app/dist (APP_BASE=/ npm run build)
//   node app/tools/pair-live.mjs --shots <dir>   where to put failure screenshots
//
// ## What is real here, and what is not
//
// Real: the built app, the Pages Functions in app/functions/ (served by
// `wrangler pages dev`, the same runtime Cloudflare uses), and a real D1 —
// SQLite on disk, migrated by the same files in worker/migrations/ that
// production runs. Two browser contexts are two phones: separate IndexedDB,
// separate localStorage, nothing shared but the server.
//
// Not real: the network between them (both are on 127.0.0.1) and Workers AI.
// The `[ai]` binding cannot run locally — wrangler insists on a remote session
// and a Cloudflare token for it — so the server is started from a temporary
// directory holding a copy of app/wrangler.toml without that one table, with
// functions/ and dist/ symlinked back. Nothing in pairing touches AI, and a
// deploy without it is a supported configuration (see /api/health).
//
// Same conventions as visual.mjs: raw `playwright`, the sandbox's Chromium
// pinned by path, and its own tiny `check()` rather than a second test runner.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(ROOT, 'app');
const WRANGLER = join(ROOT, 'node_modules', '.bin', 'wrangler');
const argv = process.argv.slice(2);
const shotsAt = argv.indexOf('--shots');
const SHOTS = shotsAt >= 0 ? argv[shotsAt + 1] : join(ROOT, '.shots', 'pair-live');

/** How long the phone that started may take to notice its partner, unprompted. */
const DISCOVERY_MS = 20000;
/** How long a partner's new name may take to arrive, unprompted: one gentle poll (30s) plus slack. */
const NAME_MS = 45000;

if (!existsSync(join(APP, 'dist', 'index.html'))) {
  console.error('pair-live: app/dist is missing — run `APP_BASE=/ npm run build` first.');
  process.exit(2);
}

// ---- the server -------------------------------------------------------------

const work = mkdtempSync(join(tmpdir(), 'pair-live-'));
const state = join(work, 'state');
const root = join(work, 'root');
mkdirSync(state);
mkdirSync(root);
symlinkSync(join(APP, 'functions'), join(root, 'functions'));
symlinkSync(join(APP, 'dist'), join(root, 'dist'));
writeFileSync(join(root, 'wrangler.toml'), withoutTable(readFileSync(join(APP, 'wrangler.toml'), 'utf8'), 'ai'));

/** Drops one `[table]` and its keys; every other line is left exactly as written. */
function withoutTable(toml, name) {
  let skipping = false;
  return toml
    .split('\n')
    .filter((line) => {
      const header = line.match(/^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/);
      if (header) skipping = header[1].trim() === name;
      return !skipping;
    })
    .join('\n');
}

const children = [];
function run(args, cwd, { wait = true } = {}) {
  const child = spawn(WRANGLER, args, {
    cwd,
    env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  if (!wait) {
    children.push(child);
    return { child, log: () => log };
  }
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => (code === 0 ? resolve(log) : reject(new Error(`wrangler ${args.join(' ')} exited ${code}\n${log}`))));
  });
}

function freePort() {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function cleanup() {
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
  rmSync(work, { recursive: true, force: true });
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });

console.log('pair-live: migrating a fresh local D1');
await run(['d1', 'migrations', 'apply', 'heartbeat', '--local', '--persist-to', state], join(ROOT, 'worker'));

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
console.log(`pair-live: serving app/dist + app/functions on ${base}`);
const server = run(['pages', 'dev', 'dist', '--persist-to', state, '--port', String(port), '--ip', '127.0.0.1'], root, { wait: false });

const deadline = Date.now() + 90000;
for (;;) {
  const health = await fetch(`${base}/api/health`).then((r) => (r.ok ? r.json() : null), () => null);
  if (health?.db) break;
  if (Date.now() > deadline) {
    console.error(`pair-live: the server never answered /api/health with db:true\n${server.log()}`);
    cleanup();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}

// ---- the phones -------------------------------------------------------------

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

/** A fresh phone: its own storage, past the first-run gates, on Settings. */
async function phone(label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem('heartbeat.calm', 'true');
  });
  const page = await context.newPage();
  page.label = label;
  await prime(page);
  return page;
}

/**
 * The same seed visual.mjs writes: two booleans into the `settings` row, merged
 * rather than replaced, after Dexie has built the database. Retried because the
 * app's own boot writes can land after it — see visual.mjs's `prime` for the
 * long version of why.
 */
async function prime(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${base}/#/welcome`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => indexedDB.databases().then((dbs) => dbs.some((d) => d.name === 'heartbeat')),
      null,
      { timeout: 15000, polling: 200 },
    ).catch(() => {});
    await page.waitForTimeout(600);
    const wrote = await page.evaluate(() => new Promise((resolve) => {
      const request = indexedDB.open('heartbeat');
      request.onupgradeneeded = () => resolve('heartbeat did not exist');
      request.onerror = () => resolve(String(request.error));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        const read = store.get('settings');
        read.onsuccess = () => store.put({ ...(read.result ?? {}), id: 'settings', guestAcknowledged: true, onboarded: true });
        tx.oncomplete = () => { db.close(); resolve('ok'); };
        tx.onerror = () => resolve(String(tx.error));
      };
    }));
    if (wrote !== 'ok') continue;
    await page.goto(`${base}/#/settings`, { waitUntil: 'load' });
    const onSettings = await page.getByRole('heading', { name: 'The two of you' })
      .waitFor({ timeout: 8000 }).then(() => true, () => false);
    if (onSettings) return;
  }
  throw new Error(`${page.label}: could not get past the first-run gates`);
}

const namingGate = (page) => page.getByRole('heading', { name: 'You’re paired' });

async function startPairing(page) {
  await page.getByRole('button', { name: /^Start a/ }).click({ timeout: 10000 });
  const code = (await page.locator('.invite-code').textContent({ timeout: 10000 }))?.trim();
  if (!code) throw new Error(`${page.label}: no invite code appeared`);
  return code;
}

async function joinWith(page, code) {
  const field = page.getByLabel('Invite code');
  if (!(await field.isVisible())) throw new Error(`${page.label}: there is nowhere to type a code`);
  await field.fill(code);
  await page.getByRole('button', { name: 'Join with this code' }).click({ timeout: 10000 });
}

// ---- the scenarios ----------------------------------------------------------

const results = [];
async function scenario(name, body) {
  const pages = [];
  const open = async (label) => { const p = await phone(label); pages.push(p); return p; };
  try {
    await body(open);
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}\n        ${String(error.message).split('\n')[0]}`);
    mkdirSync(SHOTS, { recursive: true });
    for (const p of pages) {
      const file = join(SHOTS, `${name.replace(/\W+/g, '-')}-${p.label}.png`);
      await p.screenshot({ path: file, fullPage: true }).catch(() => {});
      console.log(`        screenshot: ${file}`);
    }
  } finally {
    for (const p of pages) await p.context().close().catch(() => {});
  }
}

await scenario('one starts, the other joins, both find out', async (open) => {
  const a = await open('A');
  const b = await open('B');
  const code = await startPairing(a);
  // A puts the phone down on the home screen. Nothing it does from here on
  // should be needed for it to learn that B arrived.
  await a.goto(`${base}/#/`, { waitUntil: 'load' });
  await joinWith(b, code);
  await namingGate(b).waitFor({ timeout: 10000 }).catch(() => {
    throw new Error('B joined but never saw that it is paired');
  });
  await namingGate(a).waitFor({ timeout: DISCOVERY_MS }).catch(() => {
    throw new Error(`A never found out B joined (waited ${DISCOVERY_MS / 1000}s, no reload, no Settings visit)`);
  });
});

await scenario('names cross between the two phones', async (open) => {
  const a = await open('A');
  const b = await open('B');
  const code = await startPairing(a);
  await joinWith(b, code);
  for (const [page, name] of [[b, 'Bee'], [a, 'Ada']]) {
    await namingGate(page).waitFor({ timeout: DISCOVERY_MS });
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await namingGate(page).waitFor({ state: 'detached', timeout: 10000 });
  }
  // Both are still on Settings, where they paired. B named itself first, so it
  // has been looking at a nameless partner since — and the screen promises the
  // name "will show up here the moment they do". No navigation, no reload.
  for (const [page, other] of [[a, 'Bee'], [b, 'Ada']]) {
    await page.getByText(`You’re linked with ${other}.`).first().waitFor({ timeout: NAME_MS }).catch(() => {
      throw new Error(`${page.label} never showed its partner's name "${other}" (waited ${NAME_MS / 1000}s, no navigation)`);
    });
  }
});

await scenario('both tapped Start, and they can still link', async (open) => {
  const a = await open('A');
  const b = await open('B');
  const code = await startPairing(a);
  await startPairing(b);
  await joinWith(b, code);
  await namingGate(b).waitFor({ timeout: 10000 }).catch(() => {
    throw new Error('B joined A\'s code but never saw that it is paired');
  });
  await namingGate(a).waitFor({ timeout: DISCOVERY_MS }).catch(() => {
    throw new Error('A never found out B joined');
  });
});

await scenario('a phone waiting for its partner is not offered a way to split', async (open) => {
  const a = await open('A');
  await startPairing(a);
  const split = a.getByRole('button', { name: 'Start a new pairing instead' });
  if (await split.isVisible()) {
    throw new Error('"Start a new pairing instead" is on screen while the code is still live and nobody has joined');
  }
});

// ---- done -------------------------------------------------------------------

await browser.close();
cleanup();
const failed = results.filter((r) => !r.ok).length;
console.log(`\npair-live: ${results.length - failed}/${results.length} scenarios passed`);
process.exit(failed ? 1 : 0);
