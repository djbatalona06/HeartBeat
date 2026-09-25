# design-system.md — the tokens, the components, and the guardrails

What to reach for, what not to write, and what CI will stop you doing.

---

## 1 · Tokens

Every colour, radius, duration, shadow and font is a CSS custom property written
by `themes/tokens.ts`. **`applyTheme` sets them as inline styles on the root
element at runtime**, from a theme the couple picked in Settings — so a
component never imports a theme object, and switching theme repaints without
re-rendering anything.

That one fact decides most of the rules below, and it is why this repo has no
Tailwind. See [`TAILWIND.md`](./TAILWIND.md), and [`PULSE.md`](./PULSE.md) for
the same question asked about a first-party CSS-in-JS layer.

### Space, type, tap

| Token | Value | Use for |
|---|---|---|
| `--space-1` … `--space-7` | 4 · 8 · 12 · 16 · 24 · 32 · 44 px | Every gap and pad. A raw `14px` is drift. |
| `--stack` | 18px | The gap between stacked cards. Raise this first when a screen feels crowded. |
| `--text-xs` … `--text-3xl` | 12px → fluid 44px | Nothing carrying meaning goes below `--text-xs`. |
| `--tap` | 48px | Above Apple's 44pt floor. The posture is a phone in bed, one-handed. |
| `--shell-max` / `--shell-gutter` | 560px / 18px | The column. |
| `--tabbar-h` / `--shell-bottom-clear` | 62px / bar + `--space-5` | What a page must leave clear. |

**Faces.** `--font-body` is Outfit in every pack: it carries the numbers,
dates and lists, and one body face means no screen reflows when the pack
changes. `--font-display` is where a pack gets its voice:

| Pack | Headline face |
|---|---|
| kitty, pony | Shantell Sans |
| sponge | Bricolage Grotesque |
| avatar | Fraunces |
| shinobi | Handjet |

Each stack falls back to Outfit. The headline faces are latin-only variable
files in `app/public/fonts/display/`, and they are **not precached**: together
they are ~160 KiB, against a precache ceiling (`tools/lighthouse.mjs`) that had
~55 KiB of room. `pwa/sw.ts` caches each one the first time a pack asks for it.
A browser never requests a face no text uses, so an unused pack costs nothing.
Adding a face means the `@font-face` block in `styles.css`, the file, and
nothing in `vite.config.ts` — the `fonts/display/**` ignore already covers it.

### Colour

`--color-base` · `--color-surface` · `--color-surface-muted` · `--color-border` ·
`--color-text` · `--color-text-muted` · `--color-accent` · `--color-accent-text` ·
`--color-danger` · `--color-success`

Plus the overlay layer, all `color-mix` over those rather than fixed rgba:
`--scrim` (72%) · `--glass` (82%) · `--hairline`.

**`--scrim` and `--glass` are load-bearing.** `themes/veil.test.ts` composites
them over every colour the garden can paint and proves the text on top still
clears AA. Lowering either without running that test is how the home screen
stops being legible at four in the afternoon on one theme and nobody notices
for a month.

### Colour that moves — `--color-accent-live`

The accent the app actually paints with. It is `--color-accent` leaned a
bounded distance toward another colour *in the same palette*, by the pet's
mood: `success` when happy, `base` when sleepy — so the accent recedes into the
page rather than dimming to grey. `content` is the untouched accent, so the app
at rest is the theme exactly as designed.

| Token | Value | Use for |
|---|---|---|
| `--color-accent-live` | `color-mix` over the pack's own accent | `.primary`, `.home-pet-fill`, `.bar-fill-accent` |
| `--mood-warm` / `--mood-dim` | 85% / 85% | The lean's strength. Emitted from `tokens.ts`. |

Three things about it are deliberate and easy to undo by accident:

- **The mix is in `styles.css`, not in `tokens.ts`.** `applyTheme` writes
  tokens as inline styles, so an accent computed in TypeScript would go stale
  on every theme and mode change. A `color-mix` over `var()` re-resolves
  against whatever palette is showing. The only JavaScript is `applyMood`,
  which sets `data-mood` on the root element — the same mechanism as
  `data-theme`, `data-mode` and `data-calm`.
- **The strengths are emitted, not written twice.** `--mood-warm` and
  `--mood-dim` come from the constants `themes/mood.test.ts` measures, for the
  reason `--scrim` and `--glass` do: a number in two places gets tuned in one.
- **`mood.test.ts` is load-bearing.** It walks five packs × two palettes ×
  three moods and proves the button label still clears AA on every accent this
  can produce (floor 5.22:1), and that the sleepy lean never spends more than
  30% of the separation the pack already had. Lower either strength and it
  fails.

Why a lean and not the hue rotation this was first sketched as:
[`PULSE.md`](./PULSE.md) §3.

### Depth

| Token | Use for |
|---|---|
| `--lift-1/2/3` | 1 / 2 / 4px. The offsets the shadows are built from. |
| `--press` | 2px. How far a pressed thing travels. One number so a press is the same gesture everywhere. |
| `--shadow-contact` | Tight and close. An object resting *on* something. |
| `--shadow-lift` | Raised. Contact plus a wider pool. |
| `--shadow` / `--shadow-color` | The theme's own, emitted **mode-corrected**. |
| `--grain-opacity` | 3.5% light / 5.5% dark. |
| `--tier-ring-*` | The rarity ladder as light: one hue, five strengths. |

A press is `translateY(var(--press))` **and** the shadow collapsing to
`--shadow-contact`. Travel alone reads as the card sliding; a shadow change
alone reads as the light moving. Both together read as a finger.

### Depth, as z-index

`--z-scene: 0` · `--z-content: 1` · `--z-chrome: 6` · `--z-overlay: 40` ·
`--z-sheet: 45` · `--z-toast: 50`

The scale exists so the next overlay is not `9999` because nobody could tell
what it had to beat. **CI fails a hand-written `z-index` above 6.**

Not every rule below 6 uses the tokens, and that is knowingly left alone: the
tab bar is a fixed sibling at a raw `2`, which is why the film grain hangs off
`.shell` rather than `body` — a pseudo-element inside the shell's own stacking
context is under every fixed sibling by construction, and there is no integer
between `1` and `2` to put it at otherwise.

---

## 2 · Components

`ui/` is the library. `components/` is what two or more features share.
`features/<name>/` is everything else.

| Component | For |
|---|---|
| `PrimaryAction` | The one thing this screen is for. **One per screen.** `busy` ≠ `disabled`: disabled is "you may not", busy is "you already did". |
| `SecondaryAction` | The second-most important thing — often a `ListRow` instead. |
| `TileCard` | The workhorse. Four variants: `default`, `quest`, `log`, `companion`. A fifth needs a structural difference, not a colour. |
| `ListRow` · `Chip` · `StatChip` · `BadgeDot` | Rows, filters, numbers, dots. |
| `Sheet` | A scrim, a panel, a focus trap, and focus restore on **every** close path. |
| `EmptyState` · `Skeleton` · `Toast` · `ProgressHex` | Nothing yet, not yet, just happened, progress. |
| `layout/Screen` · `BottomNav` · `HeroStage` · `SwipePane` | The shell. |

### The rules with teeth

- **A raw `<button>` fails review.** It gets no `--press`, no shadow collapse,
  no busy-versus-disabled. CI enforces this as a **ratchet**: 57 predate the
  library and are recorded in `scripts/ui-review-baseline.json`; the build
  fails when a file gains one it did not have. Fixing them is a series of small
  green diffs — `npm run ui:check -- --update` after each.
- **No pure black, no pure white.** A `rgba(0,0,0,…)` shadow is a smudge on a
  light palette and a hole on a dark one; that is what `--shadow-color` is for.
  Exemptions are named in the check with reasons.
- **At most three panes per `SwipePane`, three viewport-heights per screen.**
  `ui/layout/contract.ts`, as arithmetic, as dev-time warnings — never thrown.
  A crash screen for a couple who wanted to log a walk is the wrong trade.

---

## 3 · The guardrails

| Command | What it checks | Needs a build |
|---|---|---|
| `npm run ui:check` | Raw buttons, pure black/white, raw z-index. | no |
| `npm test` | 2174 unit tests. `.test.ts` in node, `.test.tsx` in jsdom. | no |
| `npm run visual` | Screenshots every screen × 2 packs × 2 modes, and runs axe-core on the same visit. | **yes** |
| `npm run lighthouse` | Lighthouse against `vite preview`, plus the precache budget read off the built `sw.js`. | **yes** |

### Writing a `.test.tsx`

The runner was widened from `.ts`-only for one reason, and the bar comes from
it: **a component test earns its place by asserting behaviour a screenshot
cannot.** `Sheet.test.tsx` is the model — a Tab that escapes a focus trap looks
identical in a picture and is a real keyboard bug. "It renders" is not that, and
belongs in the visual walk.

`.test.tsx` gets jsdom; everything else stays in node. A domain test that starts
needing a DOM fails, which is `docs/DESIGN.md`'s layering rule enforced by the
runner instead of by review.

### The visual walk

- **Two packs, two modes** — kitty/light and shinobi/dark. Every pack is the
  same markup with different custom properties, so a third re-proves the
  second. Two rather than one catches a rule that hard-codes whichever pack
  generated the baselines; light and dark cover both sides of every
  mode-corrected token.
- **Everything is frozen** — `data-calm`, `prefers-reduced-motion`, a blanket
  `animation-play-state: paused`, and a transparent caret. A screenshot of a
  breathing pet is a screenshot of a moment.
- **Byte comparison, no tolerance.** Every source of jitter is pinned, so a
  differing byte means something changed. A threshold is a place for a real
  regression to hide.
- **axe runs with `color-contrast` off.** `veil.test.ts` already answers that
  question properly with the real tokens; axe cannot see through a fixed
  backdrop to the ground a card actually sits on, and would report the garden's
  gradient as a failure on every frame.
- Only `critical` and `serious` violations fail. Moderate and minor print. The
  difference between a guardrail and a nuisance is whether it can be ignored
  honestly.

### ⚠️ Baselines are not committed yet — and they must come from CI

The walk **seeds** baselines on its first run and passes, so today it guards
console errors, route reachability and axe — but not pixels.

**Do not generate them on your own machine.** A screenshot is a rasterisation,
and it depends on the Chromium build, the font stack and the GPU path of the
machine that took it. Baselines made on a laptop will not byte-match the ones
CI takes on `ubuntu-latest`, and since the comparison is byte-exact (see above),
every CI run would fail forever. This is not a tolerance to loosen — the whole
value of a byte comparison is that a differing byte means something changed.

So the baselines come from the environment that compares them:

1. Push a branch. CI runs `npm run visual`, which seeds the ten frames and
   uploads them as the **`visual-frames`** artifact.
2. Download that artifact and **look at all ten frames.** A baseline nobody
   reviewed is a bug frozen into the repo that passes forever.
3. Commit them to `app/tools/baselines/` with the same names.

Then add `--require-baselines` to the `visual` step in `ci.yml`. From then on
`npm run visual` fails on any pixel change *and* on any frame that has lost its
baseline, and the diff in review is the picture that changed. To re-bless after
an intended change, take the new frames from the same artifact rather than
running `visual:update` locally — for the same rasterisation reason.

Until then the walk names every unverified frame in its summary and prints
`NOTE  n of these frames were not verified against anything.` under the PASS.
A run that compared nothing must not read as a run that found nothing wrong —
before that, ten "seeded" lines scrolled past and the PASS was the only thing
anybody read.

`npm run visual` locally is still useful for everything that is not the pixel
comparison: it catches console errors, a route that stopped being reachable,
and axe violations. Those answers are machine-independent.

One piece of housekeeping after a local run: the walk writes its ten frames
into `app/tools/baselines/` and leaves them **untracked**, where a `git add -A`
would sweep them into a commit. Delete them. Committing frames rasterised
anywhere but CI is the mistake this whole section exists to prevent, and doing
it by accident looks exactly like doing it on purpose. They are deliberately
not in `.gitignore` — that path is how the real ones eventually land.

#### ⚠️ The walk mostly screenshots the pairing gate, not the app

`prime()` seeds `guestAcknowledged` and `onboarded`, which is everything
`FirstRunGate` asks for. It can do nothing about **`PairGate`**, because
pairing needs a `workerSecret` only the server can issue — and `/` is not in
`OPEN_WHILE_UNPAIRED`, so an unpaired browser at `#/` gets the pair invitation
**rendered in place, at the same hash, with no redirect**.

So four of the five screens the walk visits — home, mood, tasks, party — are
almost certainly the same invitation five times over, and only `/settings` is
itself. The per-screen "is reachable" check cannot see this: it compares the
hash, and the hash is exactly what it asked for. That is also why it went
unnoticed.

What the walk still earns: console errors on boot, that the first-run gates can
be got past at all, and axe on whatever did render. What it does not currently
earn is coverage of the five screens by name.

Fixing it means seeding a `coupleId` and a `workerSecret` in `prime()` so
`isPaired` is true. That is a small change to this file and a potentially large
one to its output — five real screens' worth of axe results that have never
been looked at, and ten baselines of something other than what is there now.
Worth doing deliberately rather than as a side effect of something else.

#### If the walk reports it could not get past the first-run gates

That is `prime()` in `app/tools/visual.mjs` failing three times. `FirstRunGate`
sends a browser that has never paired to `/welcome` and then `/onboarding`, and
the walk seeds `guestAcknowledged` and `onboarded` to get through. If the
conditions those are read under change, this is where it shows up — as one
honest failure rather than ten screenshots of the onboarding screen.

**If instead it reports the gates open and then fails on `home`**, that was a
bug in `prime()`'s own verification and is fixed. It polled for
`location.hash === '#/'` — the hash `goto` had just set — so it raced
`FirstRunGate`'s redirect in both directions: a poll landing before the gate
ran reported success and let the walk discover the bounce later at `home`,
while one landing after spent ten seconds waiting for a hash that was not
coming back. It now resolves on whichever actually happens, using the
dashboard's own `.home-pet` as the evidence that the gate opened rather than
that it had not yet run.
