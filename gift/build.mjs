// Builds gift/birthday.html — one file, no network, no dependencies.
//
// She will open this by double-clicking it off a USB stick in four years, on a
// laptop with no internet, long after unpkg has reorganised its URLs. So every
// byte it needs lives inside it: three.js, both typefaces, all 29 photographs
// and the song. Nothing is fetched at runtime.
//
// Usage: node gift/build.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'src');

// Two builds, because this repository is public.
//
//   node gift/build.mjs               -> birthday.html            (committed)
//   node gift/build.mjs --with-audio  -> birthday-with-music.html (gitignored)
//
// The song is a commercially released recording. Embedding it in a file that
// GitHub then serves to anyone is redistribution, whatever the intent, so the
// committed artefact ships silent and the version with music is built locally
// and sent to her directly.
const WITH_AUDIO = process.argv.includes('--with-audio');
const OUT = join(HERE, WITH_AUDIO ? 'birthday-with-music.html' : 'birthday.html');

const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');
const b64 = (...p) => readFileSync(join(SRC, ...p)).toString('base64');

// A literal </script> inside an inlined script would close the tag early and
// dump the rest of three.js into the page as text.
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

// ---- fonts: swap each uuid src for the woff2 it names ----------------------
let fonts = read('fonts.css');
const fontDir = join(SRC, 'fonts');
let fontCount = 0;
for (const file of readdirSync(fontDir)) {
  if (extname(file) !== '.woff2') continue;
  const uuid = file.replace('.woff2', '');
  const uri = `data:font/woff2;base64,${b64('fonts', file)}`;
  const before = fonts;
  fonts = fonts.split(`"${uuid}"`).join(`"${uri}"`);
  if (fonts !== before) fontCount++;
}
const leftover = fonts.match(/url\("(?!data:)[^"]*"\)/g);
if (leftover) throw new Error(`unresolved font refs: ${[...new Set(leftover)].slice(0, 3).join(', ')}`);

// ---- photos: p01..p26 then m1..m3, so the heart fills in a sensible order ---
const photoDir = join(SRC, 'photos');
const photoFiles = readdirSync(photoDir)
  .filter((f) => f.endsWith('.jpg'))
  .sort((a, b) => {
    const rank = (n) => (n.startsWith('p') ? 0 : 1);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
if (!photoFiles.length) throw new Error('no photos found — run gift/tools/extract.mjs first');
const photoURIs = photoFiles.map((f) => `data:image/jpeg;base64,${b64('photos', f)}`);

// ---- audio ------------------------------------------------------------------
const audioPath = join(SRC, 'audio', 'amber.mp3');
let audioTag = '';
let audioNote = WITH_AUDIO ? 'absent — sound control hidden' : 'omitted (public build)';
if (WITH_AUDIO && existsSync(audioPath)) {
  audioTag = `<source src="data:audio/mpeg;base64,${b64('audio', 'amber.mp3')}" type="audio/mpeg">`;
  audioNote = `${(statSync(audioPath).size / 1048576).toFixed(2)} MB`;
}

// ---- favicon: the same cat mark the seal uses -------------------------------
const favicon =
  `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 78">` +
      `<path d="M22 26C16 12 20 6 26 5c7-1 14 6 18 15z" fill="%23fff"/>`.replace(/%23/g, '#') +
      `<path d="M78 26C84 12 80 6 74 5c-7-1-14 6-18 15z" fill="#fff"/>` +
      `<ellipse cx="50" cy="44" rx="33" ry="27" fill="#fff"/>` +
      `<ellipse cx="38" cy="42" rx="3.4" ry="4.6" fill="#2a0f1c"/>` +
      `<ellipse cx="62" cy="42" rx="3.4" ry="4.6" fill="#2a0f1c"/>` +
      `<ellipse cx="50" cy="50" rx="4.6" ry="3.3" fill="#f5c85c"/>` +
      `<circle cx="25" cy="22" r="8" fill="#d81f45"/>` +
      `</svg>`
  )}">`;

// ---- assemble ---------------------------------------------------------------
const photosJs = `window.GIFT_PHOTOS = ${JSON.stringify(photoURIs)};\n`;

let html = read('index.html')
  .replace('<!--INLINE:FAVICON-->', favicon)
  .replace('/*INLINE:FONTS*/', () => fonts)
  .replace('/*INLINE:KEYFRAMES*/', () => read('keyframes.css'))
  .replace('/*INLINE:STYLES*/', () => read('styles.css'))
  .replace('/*INLINE:THREE*/', () => safe(readFileSync(join(SRC, 'vendor', 'three.min.js'), 'utf8')))
  .replace('/*INLINE:CRATE*/', () => safe(read('crate.js')))
  .replace('/*INLINE:APP*/', () => safe(photosJs + read('app.js')))
  .replace('<!--INLINE:AUDIO-->', () => audioTag);

if (!audioTag) html = html.replace('<div class="sound" id="sound"', '<div class="sound" id="sound" hidden');

// ---- verify self-containment -------------------------------------------------
const remaining = html.match(/(?:src|href)="(?!data:|#)[^"]*"/g) || [];
const external = remaining.filter((m) => !/^href="https:\/\/github\.com/.test(m));
if (external.length) throw new Error(`external references remain: ${external.slice(0, 5).join(', ')}`);
if (/INLINE:/.test(html)) throw new Error('an INLINE placeholder was left unfilled');

writeFileSync(OUT, html, 'utf8');

if (WITH_AUDIO && !audioTag) {
  console.warn('! --with-audio was passed but gift/src/audio/amber.mp3 is missing');
}

const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
console.log(`photos   ${photoFiles.length}`);
console.log(`fonts    ${fontCount} files across ${(fonts.match(/@font-face/g) || []).length} rules`);
console.log(`audio    ${audioNote}`);
console.log(`three.js ${(statSync(join(SRC, 'vendor', 'three.min.js')).size / 1024).toFixed(0)} KB`);
console.log(`\n-> gift/${WITH_AUDIO ? 'birthday-with-music.html' : 'birthday.html'}  ${mb} MB`);
