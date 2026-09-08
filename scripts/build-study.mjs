// Builds study.html — one file, no network, no dependencies.
//
// The same promise gift/build.mjs makes, for a different artefact: this is the
// study page from the app, double-clickable, working on a laptop with no
// internet years from now. So every byte it needs lives inside it — React, the
// theme engine, all five backdrops, both typefaces and 226 cards. Nothing is
// fetched at runtime.
//
// Usage: node scripts/build-study.mjs

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const APP = join(ROOT, 'app');
const DIST = join(APP, 'dist-standalone');
const OUT_DIR = join(ROOT, 'study');
const OUT = join(OUT_DIR, 'index.html');

// A literal </script> inside inlined JS would close the tag early and dump the
// rest of the bundle into the page as text. Same hazard gift/build.mjs guards.
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

// ---- 1. bundle ---------------------------------------------------------------
console.log('bundling…');

// Vite's own entry, run with this Node rather than through `npx`. Two reasons:
// npx resolves to a .cmd on Windows, which Node 24 refuses to spawn without a
// shell; and going straight to the file means the build cannot silently pick up
// a different Vite than the one the lockfile pins.
// Resolved via package.json rather than the bin path directly: Vite's `exports`
// map does not list ./bin/vite.js, so asking for it by name is refused.
const vitePkg = createRequire(import.meta.url).resolve('vite/package.json');
const viteBin = join(dirname(vitePkg), 'bin', 'vite.js');
execFileSync(
  process.execPath,
  [viteBin, 'build', '--config', 'vite.standalone.config.ts'],
  { cwd: APP, stdio: 'inherit' },
);

// ---- 2. read what it emitted -------------------------------------------------
const emitted = readdirSync(DIST);
const jsFile = emitted.find((f) => f.endsWith('.js'));
const cssFile = emitted.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error(`no javascript in ${DIST} — the bundle step produced nothing`);

const js = readFileSync(join(DIST, jsFile), 'utf8');
const css = cssFile ? readFileSync(join(DIST, cssFile), 'utf8') : '';

// ---- 3. fonts ----------------------------------------------------------------
// The two woff2 files live in app/public/ and are referenced from styles.css by
// absolute URL, so Vite copies them rather than processing them and they are
// still a network reference at this point. Swap each for a data URI, exactly as
// gift/build.mjs does for its own typefaces.
const fontDir = join(APP, 'public', 'fonts');
let inlinedCss = css;
let fontCount = 0;
for (const file of readdirSync(fontDir)) {
  if (extname(file) !== '.woff2') continue;
  const uri = `data:font/woff2;base64,${readFileSync(join(fontDir, file)).toString('base64')}`;
  const before = inlinedCss;
  inlinedCss = inlinedCss.split(`/fonts/${file}`).join(uri);
  if (inlinedCss !== before) fontCount += 1;
}

// ---- 4. favicon: the same cat mark the app uses ------------------------------
const favicon = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 78">'
  + '<path d="M22 26C16 12 20 6 26 5c7-1 14 6 18 15z" fill="#fff"/>'
  + '<path d="M78 26C84 12 80 6 74 5c-7-1-14 6-18 15z" fill="#fff"/>'
  + '<ellipse cx="50" cy="44" rx="33" ry="27" fill="#fff"/>'
  + '<ellipse cx="38" cy="42" rx="3.4" ry="4.6" fill="#2a0f1c"/>'
  + '<ellipse cx="62" cy="42" rx="3.4" ry="4.6" fill="#2a0f1c"/>'
  + '<ellipse cx="50" cy="50" rx="4.6" ry="3.3" fill="#f5c85c"/>'
  + '<circle cx="25" cy="22" r="8" fill="#d81f45"/>'
  + '</svg>',
)}">`;

// ---- 5. assemble -------------------------------------------------------------
let html = readFileSync(join(DIST, 'study.html'), 'utf8');

// Vite leaves <script src> and <link rel=stylesheet> pointing at the two files
// next to it. Replace each tag with its contents.
html = html
  .replace(/<script[^>]*src="[^"]*\.js"[^>]*><\/script>/, () => `<script type="module">${safe(js)}</script>`)
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/, () => `<style>${inlinedCss}</style>`)
  .replace('</head>', `${favicon}</head>`);

// ---- 6. verify self-containment ----------------------------------------------
// The check that makes the promise real rather than aspirational: if anything
// still points outward, the build fails here rather than the file failing on a
// laptop with no internet in four years.
const external = (html.match(/(?:src|href)="(?!data:|#)[^"]*"/g) || [])
  .filter((m) => !/^href="https:\/\/github\.com/.test(m));
if (external.length) {
  throw new Error(`external references remain: ${external.slice(0, 5).join(', ')}`);
}
if (/\.js"|\.css"/.test(html)) throw new Error('a script or stylesheet reference survived inlining');
if (!/<script type="module">/.test(html)) throw new Error('the bundle was not inlined');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, html, 'utf8');

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`\njs       ${kb(Buffer.byteLength(js))}`);
console.log(`css      ${kb(Buffer.byteLength(inlinedCss))}`);
console.log(`fonts    ${fontCount} inlined`);
console.log(`\n-> study/index.html  ${kb(Buffer.byteLength(html))}`);

if (!existsSync(OUT)) throw new Error('the file was not written');
