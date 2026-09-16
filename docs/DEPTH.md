# DEPTH.md — the 2.5D pass, and what it costs

A review of the "grainy 2.5D mobile RPG" brief against what this repo actually
is, and a plan for the part of it worth building.

**Slot:** between step 6 (pages adopt the library) and step 7 (CI guardrails).
The ordering is not cosmetic — see §5.
**Budget:** no new dependencies, no new image assets, no new build step. One
stylesheet, a handful of tokens, one SVG layer.

---

## 1 · The brief describes a different app

The advice is generic, and it says so — it was written from guesses about the
repo rather than the repo. Four of its premises are not true here, and acting on
them would be the entire cost it was trying to save:

| The brief assumes | What is actually here |
|---|---|
| p5.js generative canvas, audio-reactive | No p5.js. `themes/useCanvasLoop.ts` is a 60-line 2D-context loop, one per theme pack. |
| `bpm`, `isPlaying`, `intensity` in a `HeartBeatContext` | **There is no audio anywhere in the app.** No BPM, no playback state. `grep -r bpm app/src` is empty. HeartBeat is a couples tracker; the heartbeat is the name. |
| Tailwind (`@apply`, `className="absolute inset-0 z-0"`) | No Tailwind. 6,348 lines of hand-written CSS on a custom-property token system, with a contrast test that reads those tokens arithmetically. |
| `Home.jsx` to be split into TopBar / SideMenu / CentralScene / BottomNav | Already done, in steps 3–5. `ui/layout/{Screen,HeroStage,SwipePane,BottomNav}`, `components/StatusHud`, `components/MenuSheet`. |

So the "80% visual match in a few days" estimate is measuring from a starting
point this branch passed three PRs ago.

### The specific snippets, and why each is a no

- **`@apply` in `.btn-3d`** — requires adding Tailwind, which means a build
  change plus a reconciliation against a stylesheet whose rules carry recorded
  reasoning and a passing AA test. The most expensive line in the document.
- **Left *and* right sidebars of six buttons each** — this is the gacha chrome
  from the reference screenshot, and it is the one thing `docs/DESIGN.md` says
  explicitly not to copy: *"what is taken is the shape and the breathing room,
  not the number of things on a page."* Two vertical icon rails also break
  `ui/layout/contract.ts` — a 560px shell with a 48px tap floor has no room for
  twelve more targets, and `overBudgetWarning` would start firing on the home
  screen.
- **`/castle.png` as a midground** — a raster midground is theme-blind. Every
  backdrop in this repo is SVG whose every fill is a custom property, which is
  why a theme change repaints it for free. A PNG means five themes × two modes ×
  one asset each, and each of those enters the precache budget pinned at
  `vite.config.ts:92–104`.
- **`/pet-happy.gif`** — same problem, plus the pets are SVG mascots under a
  rights-holder guard (`mascots/roster.test.ts`, `companionSkills.test.ts`).
- **`.card-legendary { border: 2px solid #ffd700 }`** — the ladder already
  exists in `domain/rpg/tiers.ts` and `data-tier` attributes are already on
  `.gate-rank` and `.raid-source`. A hardcoded gold is a sixth palette that no
  theme voted for.
- **`transform: translateZ(-50px)`** with no `perspective` on any ancestor is a
  no-op. It tells you the snippet was written, not run.
- **`mix-blend-mode: overlay` on a fixed full-viewport layer** — the real
  landmine, and §3 is about it.

---

## 2 · How much of the 2.5D look already ships

Worth stating before planning anything, because it changes what is left to do
from "a rebuild" to "a finishing pass":

- **Three-speed parallax.** `gate-drift-far/mid/near`, 34s/22s/15s, driving the
  gate scene and the garden's sky/mid/near layers. This is the brief's item 3,
  built, with the reduced-motion and `data-calm` guards the brief does not
  mention.
- **A real depth axis from the domain.** `.gate-pedestal` reads `--gate-depth`,
  written by `archLayout` in `domain/rpg/raidGate.ts`, and turns it into
  `translateY(…) scale(…)`. That *is* 2.5D: the middle of the arch stands
  nearest and largest, the ends sit back and smaller, and the number is a
  domain decision rather than a stylesheet guess.
- **A full-bleed scene behind the home screen.** `features/home/SceneBackdrop.tsx`
  paints the couple's own garden — their plots, their tether, the local hour —
  at `--z-scene: 0`, veiled by `--scrim`, contrast-proven by `themes/veil.test.ts`.
  That is the brief's "CentralScene", built, and reading live state instead of
  a fake `bpm`.
- **A z-scale.** `--z-scene: 0` → `--z-toast: 50`, written down in `tokens.ts`
  precisely so the next overlay is not `z-index: 9999` — which is the value the
  brief's grain snippet uses.
- **Press affordance on 20+ controls**, as `:active { transform: scale(…) }`.
- **A `HeroStage`** with a resolved aspect ratio, built as the seam between a
  DOM scene and a canvas one.

What is genuinely missing is four things: **grain, contact shadows, a
depth-aware press, and a foreground plane.** All four are CSS over tokens that
already exist.

---

## 3 · The plan

Five tranches, smallest first, each independently revertible. Nothing here adds
a dependency or a file the service worker has to precache.

### A · Grain — one rule, static, no blend mode

The brief's technique is right; two of its three parameters are wrong.

Add `--grain` to `SHARED_TOKENS` and a `--grain-opacity` per mode (dark carries
more grain than light before it reads as dirt). Paint it on a dedicated
`pointer-events: none` layer at a new `--z-grain: 2` — above content, **below**
`--z-chrome: 6` — so sheets, toasts and the tab bar stay clean.

Three deliberate departures from the snippet:

1. **No `mix-blend-mode: overlay`.** `overlay` changes luminance per pixel,
   which is exactly the axis `veil.test.ts` guards. That test composites
   `--scrim` over every colour the garden can paint and checks the text still
   clears AA — it models the scrim arithmetically and knows nothing about a
   blend mode, so an overlay layer would walk under the floor *silently*, which
   is the failure mode that test exists to prevent. Plain `opacity: 0.05`
   (dark) / `0.035` (light) is close to luminance-neutral and cannot.
   If the blend is wanted later it is a follow-up with a `veil.test.ts`
   extension attached, not a one-liner.
2. **`z-index: 2`, not `9999`.** The scale exists.
3. **Static, never animated.** Animated grain is a full-viewport repaint every
   frame on a phone — the single most expensive thing in the brief, and it is
   not called out there. It is also what would make step 7's screenshot
   baselines flake forever.

Honour `data-calm='true'` by dropping the layer, the way the pack backdrops
already do.

*Cost: ~30 lines in `styles.css`, two tokens. One inline SVG data URI, ~200
bytes gzipped, no network request.*

### B · Contact shadows — cards become objects on a plane

The flat read is not the absence of grain; it is that every card is a border and
a radius sitting at the same height. Add `--lift-1/2/3` and `--shadow-contact`
/ `--shadow-lift` to `tokens.ts`, mixed from `--color-base` via `color-mix`,
**never `rgba(0,0,0,…)`** — step 1 of this overhaul established no pure black
anywhere and a hand-rolled black shadow would be the first exception.

Apply to `.tile`, `.panel`, `TileCard` and the `HeroStage` frame. This is the
highest ratio of perceived depth to bytes in the whole plan.

*Cost: ~4 tokens, ~40 lines.*

### C · Depth-aware press — consolidate, don't add a class

The brief's `.btn-3d` is the right instinct (press = travel down + shadow
collapse) and the wrong delivery (a new class to apply by hand at 20 sites that
already have a press). Instead: change the shared rules so a press is
`translateY(var(--press))` with the elevation from B collapsing, and keep
`scale()` only for the small circular ticks where travel reads as a glitch.

This also front-runs step 7: the "a raw button fails review" grep is cheaper to
write against consolidated classes than against 20 bespoke `:active` rules.

*Cost: ~20 lines, mostly edits to lines that already exist.*

### D · One more plane in the garden — the foreground

`GardenBackdrop` has sky, mid, near, tether and rain. It has no **foreground**.
A near silhouette along the bottom edge, drifting fastest, is the single change
that makes everything behind it read as far away — it is how the reference
screenshot gets its depth, and it is one more `<g>` of existing custom-property
fills plus one more `gate-drift-*` keyframe at a higher amplitude.

Note it lands on both surfaces at once, which is a feature: the same component
paints behind the fight and behind the home screen.

*Cost: one `<g>`, one keyframe, one CSS rule. Re-check `veil.test.ts` — a new
painted colour is a new case for it if it is not already in the token set.*

### E · Tier glow, themed

`data-tier` already exists on `.gate-rank` and `.raid-source`. Derive
`--tier-glow` from the theme accent per rung rather than a fixed gold, and
extend the attribute to the shop and inventory rows. `Rarity` is `Tier`; read
`domain/rpg/tiers.ts` and do not introduce a sixth name for it.

*Cost: ~25 lines. No new component — `ChestAlcove` has one implementation
rendered twice and the same rule applies to anything that shows a rung.*

### Explicitly not doing

The savings are here, not in the tranches:

no Tailwind · no sidebars · no new image assets · no sprite sheets · no Rive ·
no p5.js · no animated grain · no Phaser on the home screen · no
`mix-blend-mode` on a viewport-sized layer in v1 · no `perspective`/`rotateX`
tilt (tranche D buys the same read for a fraction of the risk on iOS).

---

## 4 · Estimate

| Tranche | Files | Rough |
|---|---|---|
| A grain | `tokens.ts`, `styles.css` | 1h |
| B contact shadows | `tokens.ts`, `styles.css` | 2h |
| C depth-aware press | `styles.css` | 1h |
| D foreground plane | `GardenBackdrop.tsx`, `styles.css` | 2h |
| E tier glow | `styles.css` | 1h |

Call it a day of work, in one PR or two (A–C "material", D–E "scene"). The
brief's own estimate was "a few days of Claude iteration" for a rebuild that
would have discarded steps 3–6.

**`styles.css` changes in every tranche**, so: `npm run study:build` as the
**last** edit of the change and commit `study/index.html`, or CI fails on
`git diff --exit-code`. The artefact inlines the whole stylesheet *and* the
standalone bundle, so a rebuild that happens before one more commit lands is a
rebuild that did not happen.

---

## 5 · Why this goes before step 7, not after

Step 7's own plan ends "baselines land last". That is the argument:

1. **Baselines snapshot a look.** Land Playwright visual regression, then change
   every pixel of the app, and the re-baseline is a diff nobody can review —
   which is the guardrail not working on the first change it sees.
2. **Static grain is deterministic; animated grain is not.** Tranche A's
   "static, never animated" decision is what makes screenshot comparison
   possible at all. Deciding it after the harness exists means discovering it
   as flake.
3. **axe-core on the walk will check contrast.** Tranche A is the change most
   able to break it, and §3 already states the arithmetic reason it does not.
   Better to have that reasoning in the tree before the check that would catch
   it.
4. **Zero new assets keeps the precache budget exact.** Step 7 pins Lighthouse
   against `vite preview` in sync with `vite.config.ts:92–104`. If this pass
   adds no file the service worker precaches, that assertion can be an exact
   entry count rather than a range with headroom in it — and headroom in a
   budget is a budget that never fails.

   **Read the number off a build, not off the comment.** That comment states
   the budget twice and disagrees with itself — "twelve entries at 882 KB" at
   `vite.config.ts:67`, "19 entries / ~946 KiB" at `:100` — and CI on this
   branch reports `precache 20 entries (1041.60 KiB)`. Both numbers in the
   source are stale, which is what a budget written in prose does. Step 7's
   first job on this is to take the count from `npm run build` and put it
   somewhere that fails when it moves; a guardrail seeded from either
   comment is red on the commit that adds it.
5. **Tranche C makes the "raw button" grep cheaper**, as above.

One thing cuts the other way and is worth saying: doing the look first means
the guardrails are not there to catch a regression *in the look itself*. The
mitigation is that tranches A–E touch no logic — `npm test` and
`npm run typecheck` cover exactly as much after as before, and `veil.test.ts`
is the one guard that matters here and already exists.

---

## 6 · Verification gate

Unchanged from the standing rules, and all of it green before a push:

```bash
npm run typecheck
npm run check:config
npm test
APP_BASE=/ npm run build
npm run study:build   # last edit of the change; commit study/index.html
```
