// The review rules that are greppable, as a check.
//
// Usage: node scripts/check-ui-review.mjs
//
// ## Why a grep and not a linter
//
// There is no ESLint in this repo, and adding one to enforce three rules would
// mean a config, a plugin set, and a second opinion about the 6,300-line
// stylesheet that nobody asked for. These three are string-matchable, so they
// are matched as strings. If a fourth rule turns up that is not, that is the
// argument for a linter — not this file growing a parser.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPDATE = process.argv.includes('--update');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'app', 'src');

/**
 * Blank out comments, keeping the line count.
 *
 * Without this the check's very first run reported ninety-five colour
 * violations and every single one was prose — including the comment in
 * `styles.css` that says not to write `rgba(0, 0, 0, …)`, and the notes in
 * `avatar.tsx` and `sponge.tsx` explaining why those packs do *not* use
 * `#ffffff`. A rule that fires on the sentence describing the rule is a rule
 * nobody will keep.
 *
 * Line numbers are preserved rather than the text being deleted, because the
 * whole value of the output is telling somebody which line to open.
 */
function stripComments(body, ext) {
  let out = body.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (ext !== '.css') {
    // Not in CSS: `//` is not a comment there, and the grain's data URI has a
    // `//` in the middle of it.
    out = out.replace(/(^|[^:])\/\/.*$/gm, (m, lead) => lead + ' '.repeat(m.length - lead.length));
  }
  return out;
}

const findings = [];
function fail(file, line, rule, detail) {
  findings.push({ file: relative(ROOT, file), line, rule, detail });
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/**
 * Files exempt from the raw-button rule, with the reason each one is exempt.
 *
 * An allowlist rather than a comment convention: an inline `// eslint-disable`
 * equivalent is a rule anybody can switch off in the diff that breaks it, which
 * is the same as not having the rule. Adding a name here is a review
 * conversation, which is the point.
 */
const RAW_BUTTON_EXEMPT = new Set([
  // The components that *are* the buttons.
  'ui/PrimaryAction.tsx',
  'ui/SecondaryAction.tsx',
  'ui/Chip.tsx',
  'ui/TileCard.tsx',
  'ui/ListRow.tsx',
  'ui/Sheet.test.tsx',
  // The fallback that renders when the theme engine itself has failed, and so
  // cannot import anything that reads a token.
  'components/ErrorBoundary.tsx',
  // A day cell is not a chip. It carries three independent states -- selected,
  // today, and trained -- and paints all three from data attributes, which is
  // how `.cal-day` in the two month grids already works. Bending `Chip` to
  // pass arbitrary data attributes through for one caller would make the
  // shared primitive worse. Listed rather than left to the ratchet because the
  // check is per line and a multi-line `<button` opening tag does not match
  // it: WorkPage's and CyclePage's day cells are unexamined for the same
  // reason, and a rule this file passes by accident is not a rule.
  'features/exercise/WeekThread.tsx',
  // An icon-only dismiss on a live region. None of the four primitives is one:
  // PrimaryAction and SecondaryAction are full-width text buttons, Chip is a
  // selection in a set, ListRow is a row. What this needs is a `--tap` square
  // carrying its own `aria-label` (the × alone reads as nothing), sitting
  // *outside* the bar's own <Link> so that dismissing cannot also navigate.
  'features/notifications/NotificationHeader.tsx',
]);

/**
 * Files where a pure black or white is correct, with the reason.
 *
 * `palette.ts` holds `WHITE` and `BLACK` as the two poles of a blend that
 * never mixes past 0.85, so nothing it produces is ever either one. Its own
 * header says so, and says why `tokens.test.ts`'s no-pure-black rule does not
 * reach them: that rule asks what a theme *emits*, and these are never
 * emitted. This check asks the same question and gets the same answer.
 */
const COLOUR_EXEMPT = new Set([
  'domain/rpg/palette.ts',
]);

/**
 * The raw-button rule is a ratchet, not a gate.
 *
 * Fifty-seven bare `<button>`s predate the component library — the pages
 * adopted it in step 5, but adoption was never total. Failing the build on all
 * of them would mean either a fifty-seven-site refactor bolted onto a CI
 * change, or a rule switched off on the day it was written. Neither is a
 * guardrail.
 *
 * So the baseline records what is already there, per file, and the check fails
 * only when a file gains a button it did not have or a new file appears. The
 * count can go down freely; when it does, the run says so and
 * `--update` ratchets it. That stops the bleeding today and makes the cleanup
 * a series of small green diffs rather than one large red one.
 */
const BASELINE_FILE = join(ROOT, 'scripts', 'ui-review-baseline.json');

for await (const file of walk(SRC)) {
  if (!['.tsx', '.ts', '.css'].includes(extname(file))) continue;
  const rel = relative(SRC, file);
  const body = await readFile(file, 'utf8');
  const lines = body.split('\n');

  const code = stripComments(body, extname(file)).split('\n');
  // Colour literals are legitimate *data* in a test that asserts what the
  // palettes may contain — `tokens.test.ts` exists precisely to check that no
  // pack ships pure black. Those files are exempt from the colour rules and
  // from nothing else.
  const isTest = /\.test\.tsx?$/.test(file);

  code.forEach((text, i) => {
    const n = i + 1;

    // ---- 1 · a raw button fails review ----
    // The library exists so that a press looks and behaves the same everywhere.
    // A bare `<button>` is how that stops being true — it gets no `--press`, no
    // shadow collapse, and no busy-versus-disabled distinction.
    if (extname(file) === '.tsx' && /<button[\s>]/.test(text) && !RAW_BUTTON_EXEMPT.has(rel)) {
      fail(file, n, 'raw-button',
        'use PrimaryAction / SecondaryAction / Chip / ListRow, or add this file to RAW_BUTTON_EXEMPT with a reason');
    }

    // ---- 2 · no pure black, no pure white ----
    // Step 1 of the overhaul removed both. A shadow of `rgba(0,0,0,…)` is a
    // smudge on a light palette and a hole on a dark one, which is why
    // `--shadow-color` is emitted mode-corrected.
    if (!isTest && !COLOUR_EXEMPT.has(rel) && /#000\b|#000000\b|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/i.test(text)) {
      fail(file, n, 'pure-black', 'use var(--shadow-color) or a color-mix over a palette token');
    }
    if (!isTest && !COLOUR_EXEMPT.has(rel) && /#fff\b|#ffffff\b|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*[,)]/i.test(text)) {
      fail(file, n, 'pure-white', 'nothing in this app paints pure white — see the note in Mochi.tsx');
    }

    // ---- 3 · z-index by hand ----
    // Only inside the stylesheet, and only for values above the chrome band.
    // The scale exists in tokens.ts so that the next overlay is not `9999`
    // because nobody could tell what it had to beat.
    if (extname(file) === '.css') {
      const z = /z-index:\s*(\d+)/.exec(text);
      if (z && Number(z[1]) > 6) {
        fail(file, n, 'raw-z-index',
          `${z[1]} — use var(--z-overlay) / var(--z-sheet) / var(--z-toast)`);
      }
    }
  });
}

// ---- the raw-button ratchet -------------------------------------------------
const buttons = findings.filter((f) => f.rule === 'raw-button');
const rest = findings.filter((f) => f.rule !== 'raw-button');

const counts = {};
for (const f of buttons) counts[f.file] = (counts[f.file] ?? 0) + 1;

// Read it and let a missing file say so, rather than asking whether it exists
// and then reading it: two answers about one file with a gap in between, and
// the second read is the one that decides whether the ratchet has a baseline.
const baselineText = await readFile(BASELINE_FILE, 'utf8').catch(() => null);
const baseline = baselineText === null ? null : JSON.parse(baselineText);

if (UPDATE || baseline === null) {
  await writeFile(BASELINE_FILE, `${JSON.stringify(counts, null, 2)}\n`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`  ${UPDATE ? 'updated' : 'seeded '} the raw-button baseline — ${total} in ${Object.keys(counts).length} files`);
  // Recorded, so not also reported: the whole point of seeding is that the
  // known set is the starting line rather than a failure.
  findings.length = 0;
  findings.push(...rest);
} else {
  const regressions = [];
  const improvements = [];
  for (const [file, n] of Object.entries(counts)) {
    const was = baseline[file] ?? 0;
    if (n > was) regressions.push(`${file}: ${was} → ${n}`);
  }
  for (const [file, was] of Object.entries(baseline)) {
    const n = counts[file] ?? 0;
    if (n < was) improvements.push(`${file}: ${was} → ${n}`);
  }

  for (const r of regressions) {
    findings.push({
      file: r.split(':')[0], line: 0, rule: 'raw-button',
      detail: `gained a raw <button> (${r}) — use the library, or run with --update if this is deliberate`,
    });
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const wasTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
  if (regressions.length === 0) {
    console.log(`  ok   no new raw buttons (${total} known, ceiling ${wasTotal})`);
  }
  if (improvements.length > 0) {
    console.log(`\n  ${improvements.length} file(s) improved — run with --update to ratchet:`);
    for (const i of improvements) console.log(`    ${i}`);
  }
  // Only the regressions count; the known ones are recorded, not forgiven
  // silently — `scripts/ui-review-baseline.json` is in the tree and reviewable.
  findings.length = 0;
  findings.push(...rest, ...regressions.map((r) => ({
    file: r.split(':')[0], line: 0, rule: 'raw-button',
    detail: `gained a raw <button> (${r})`,
  })));
}

if (findings.length === 0) {
  console.log('  ok   no pure black or white outside the exemptions');
  console.log('  ok   no hand-written z-index above the chrome band');
  console.log('\nPASS');
  process.exit(0);
}

const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}
for (const [rule, items] of byRule) {
  console.log(`\n${rule} (${items.length})`);
  for (const f of items) console.log(`  ${f.file}${f.line ? ':' + f.line : ''} — ${f.detail}`);
}
console.log(`\nFAIL (${findings.length})`);
process.exit(1);
