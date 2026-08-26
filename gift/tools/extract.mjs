// One-time extraction of the photos and fonts out of the Claude Design bundle
// that this gift started life as ("Send to Jenny", National Girlfriend Day).
//
// The bundle inlines every asset as base64 in a <script type="__bundler/manifest">
// blob keyed by uuid, and the markup refers to those uuids rather than filenames.
// The only place a human-readable name survives is the hidden preload block, where
// each <img> carries a data-p attribute: data-p="p07" src="<uuid>". So we read the
// pairing from there and write real files.
//
// Usage: node gift/tools/extract.mjs <path-to-bundle.html>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

const bundlePath = process.argv[2];
if (!bundlePath) {
  console.error('usage: node gift/tools/extract.mjs <bundle.html>');
  process.exit(1);
}

const html = readFileSync(bundlePath, 'utf8');

function section(type) {
  const re = new RegExp(`<script type="__bundler/${type}">\\s*([\\s\\S]*?)\\s*</script>`);
  const m = html.match(re);
  if (!m) throw new Error(`missing __bundler/${type} section`);
  return m[1];
}

const manifest = JSON.parse(section('manifest'));
const template = JSON.parse(section('template'));

// Assets flagged compressed are raw-deflate or gzip depending on how the bundler
// packed them; try both rather than guessing. Photos and fonts are stored plain,
// so this path only matters if the bundle format changes under us.
function bytes(entry) {
  const raw = Buffer.from(entry.data, 'base64');
  if (!entry.compressed) return raw;
  for (const fn of [inflateSync, gunzipSync]) {
    try { return fn(raw); } catch { /* try the next */ }
  }
  throw new Error('could not decompress asset');
}

// data-p="p07" src="uuid"  ->  { p07: uuid }
const names = {};
for (const m of template.matchAll(/data-p="([^"]+)"\s+src="([^"]+)"/g)) {
  names[m[1]] = m[2];
}

mkdirSync(join(SRC, 'photos'), { recursive: true });
mkdirSync(join(SRC, 'fonts'), { recursive: true });

let photos = 0;
for (const [name, uuid] of Object.entries(names)) {
  const entry = manifest[uuid];
  if (!entry) { console.warn(`! no manifest entry for ${name}`); continue; }
  if (entry.mime !== 'image/jpeg') { console.warn(`! ${name} is ${entry.mime}, skipping`); continue; }
  const buf = bytes(entry);
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) {
    throw new Error(`${name} is not a JPEG (bad SOI marker)`);
  }
  writeFileSync(join(SRC, 'photos', `${name}.jpg`), buf);
  photos++;
}

// Fonts are never referenced by name, only by uuid inside @font-face src rules,
// so they get named after their uuid and the CSS is rewritten to match at build.
let fonts = 0;
for (const [uuid, entry] of Object.entries(manifest)) {
  if (entry.mime !== 'font/woff2') continue;
  writeFileSync(join(SRC, 'fonts', `${uuid}.woff2`), bytes(entry));
  fonts++;
}

// The stylesheet blocks carry the @font-face rules that point at those uuids.
// Keep them verbatim; the build step swaps uuid -> data: URI.
const styles = [...template.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
writeFileSync(join(SRC, 'extracted-styles.css'), styles.join('\n\n'), 'utf8');

console.log(`photos: ${photos}`);
console.log(`fonts:  ${fonts}`);
console.log(`styles: ${styles.length} blocks, ${styles.join('').length} chars -> src/extracted-styles.css`);
