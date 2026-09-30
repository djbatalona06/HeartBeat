<!-- GENERATED from the numbered files in this folder. Edit those, not this. -->

<!-- ===== 00_HANDOFF.md ===== -->
# 00 · Handoff — read this first

**Repo:** `djbatalona06/HeartBeat` · branch `gng/happy-gates-2x9n6b` · written 2026-09-30.
**Purpose:** a complete planning set for the next round of Heartbeat work, built
in one session so a different session (Opus) can pressure-test it and choose what
to build. **No code has been written.** PR #116 (an earlier single-file draft)
was closed; these files live on the branch only.

> Paste this whole folder (or `BUILD_PACK.md`, which is these files joined) at
> the start of the next session and say: "Here are my project documents. Use
> these as the source of truth for everything you build."

## The idea in one paragraph

Heartbeat should feel like a **wellness game**, not a pet game with a basic RPG
layer. Logging a mood, a workout, a rest or a study session should visibly change
the game world; level-ups should announce what they opened; and each of the five
companions should fight with attack / defence / magic effects that look like
*that* companion. Every screen must be accessible, including the fight canvas.

## What is decided

| Decision | Choice |
|---|---|
| Effect originality | **Hybrid:** palette + motion variants for all 15 (5 companions × physical / defensive / magic), **plus** one bespoke signature art piece per companion |
| Level-up | **Reveal what opened:** one line on Home, every milestone kind counts as "big", announced through the existing toast region |
| First build round | **A** quiz-timer fix → **B** fight-scene calm + accent → **C** per-move effects |
| "RAG" | **Red / Amber / Green** status (the repo has no retrieval layer) — see `MERGED_PLAN.md` §3 |
| Source docs | `plan.md`, `docs/WELLNESS_GAME_PLAN.md`, `docs/AUDIT_ROADMAP.md`, `docs/CURRENT_STATE.md` all stay; `MERGED_PLAN.md` says how they relate |
| Commits / PRs | No Claude name, no session IDs, no keys, nothing personal |

## What Opus should settle (open questions)

1. **Bespoke art method (Phase C):** code-drawn Phaser primitives (zero assets,
   zero precache cost) or small sprites (more distinctive, must stay lazy and out
   of the entry chunk and the 882 KB precache)?
2. **Nursing-deck `why` rationales** (`plan.md` Phase 3): author 126 rationales in
   the study repo (recommended), or make `why` optional for imported cards?
3. **Wellness "today" ring:** is a new Home surface worth it, or does
   `ChargeMeter` (garden) plus a Home pointer to it already say enough?
4. **Level-up spec reversal:** `docs/superpowers/specs/2026-09-24-levelup-moment-design.md`
   decided "Home only, no on-screen text beyond `Lv N`". The reveal line reverses
   that; confirm and update the spec's decisions table when building Phase E.
5. **Worker and .NET tests** were not re-run while planning. Run them first.

## What is verified vs not

**Verified this session:** `npm run typecheck` clean; `npm run test --workspace app`
142 files / 2,677 tests pass; every file path and function named in these docs was
read in the tree.
**Not run:** worker tests, `dotnet test`, `npm run check:config`, `npm run ui:check`,
`npm run build`, `npm run visual`, `npm run lighthouse`. Not verified: what text
`BattleLog` actually prints per turn (it is `aria-live="polite"`, line text unread);
whether a user font-size setting exists (searched settings/types, none found).

## VAPID keys — the validation checklist (ops, not a build task)

1. Generate a P-256 keypair if needed: `npx web-push generate-vapid-keys`.
2. Worker secrets, both keys: `cd worker && npx wrangler secret put VAPID_PUBLIC_KEY`
   then `VAPID_PRIVATE_KEY`.
3. Pages secret, **public key only, same value**:
   `cd app && npx wrangler pages secret put VAPID_PUBLIC_KEY --project-name heartbeat-app`.
   The private key must not exist on Pages.
4. Preview deploys need the public key in the Pages **Preview** environment too.
5. Check `https://heartbeat-eop.pages.dev/api/health` → `"push": true` and a
   `vapidPublicKey` starting `B…`. The same answer, in words, is in
   **Settings → What's on** (`features/settings/WhatsOnBlock.tsx`).
6. A trailing newline pasted into the key reads "configured" but fails
   `pushManager.subscribe`; `health.ts` trims for this reason.
7. Prove delivery with the two-phone matrix in `docs/notification-testing.md`
   (Home-Screen installs; CI cannot do this).
Production secrets cannot be checked from a build container — step 5 is the test.

## Learning checkpoints (you asked to grow, not just receive)

At each phase, do the first item yourself before asking for it; then ask what
would break if you changed it. The per-phase list is in `06_IMPLEMENTATION_PLAN.md`.

---

<!-- ===== 01_PRD.md ===== -->
# 01 · PRD — Product Requirements

## Problem

Heartbeat is a PWA for two people (mood, workouts, cycle, calendar, a shared pet
and a garden game). The game layer is deep (seven islands, five companions with
skill kits, chests, gear, charges) but it reads as a **pet game with an RPG on
top** rather than as a reward for the wellness habits underneath:

- Every basic attack, defence and magic move **looks the same** in the fight.
- Skill effects are all **white**, so nothing says *whose* move it was.
- The fight scene has **no calm / reduced-motion path**, although the dashboard
  level-up and the chest both have one.
- A level-up is a hop and a glow; what it **opened** is found by looking, not told.
- Two real defects/gaps sit beside this: the study quiz timer keeps running while
  the app is backgrounded, and the long-horizon goals are only partly visible.

## Who it is for

Two people, one shared pet, paired phones. No accounts, no email. Privacy is a
promise the README makes; nothing here may weaken it.

## Goals

1. Wellness actions visibly change the game world, and the world reads as the
   reward for the habit.
2. Level-ups **mean more**: each one says what it opened and is felt on both phones.
3. Each of the five companions has **original** attack / defence / magic effects.
4. The whole app, including the fight canvas, meets WCAG 2.2 AA.
5. The quiz timer is fair on a phone that gets phone calls.

## Requirements

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| T1 | The quiz question timer pauses while the page is hidden and resumes where it was; it never restarts | Must | A |
| S1 | Under calm mode and `prefers-reduced-motion`, the fight scene plays no tweens and adds no delay; the information still appears | Must | B |
| S2 | Skill and strike effects use the active theme's accent, not white | Must | B |
| S3 | `strike()` is told the move (`physical` / `defensive` / `magic`) and the companion (`themeId`) | Must | C |
| S4 | 15 distinct effects (5 companions × 3 moves) built from the existing five shapes with per-companion palette, count and timing | Must | C |
| S5 | One bespoke signature piece per companion (hybrid art) | Should | C |
| S6 | The turn's announcement names the move and its effect, so the canvas is never the only channel | Must | C |
| G1 | A locked-goals card shows the next long-horizon unlocks with exact numbers ("1,047 of 1,200") | Should | D |
| W1 | Copy names the person before the pet ("you moved" before "Mochi attacked") | Should | D |
| L1 | Every milestone kind (plot, skill, tether, stat, prestige) gets the big level-up moment | Should | E |
| L2 | The level-up shows one line naming what opened, read from `milestonesAt(level)`, announced via the toast region | Should | E |
| A1 | Garden playable by keyboard alone and with VoiceOver; AA contrast for all new palettes in both modes; 200% zoom clean | Must | F |

## Non-goals

- **No new currency.** Coins, energy and MP already exist and studying pays them.
- **Nothing subtracts.** Daily life never takes anything away; health exists only
  inside a boss fight. No unlock may expire, decay or carry a countdown.
- **No per-person pet, no classes.** One shared pet; stats stay flat across members.
- **No real-money code, no email, no third-party backend.**
- **No new holding kind or D1 table this round** (see `05_SCHEMA.md`).
- **No rights-holder names or likenesses** in any companion kit, effect or art.

## Success

- A fight with each of the five companions, each move type, produces visibly
  different effects in that companion's colours; under calm it produces none of
  the motion and all of the information.
- A quiz question left in the background for 30 s returns with the countdown where
  it was.
- Every fight stays winnable with **no charges and no gear** (existing C# test).
- CI stays green: typecheck, tests, build, `npm run visual` (axe), Lighthouse.

---

<!-- ===== 02_TRD.md ===== -->
# 02 · TRD — Technical Requirements

## Stack (unchanged — no new framework, no new server)

| Layer | Tech | Where |
|---|---|---|
| App | Vite + React + TypeScript PWA, Dexie (IndexedDB) | `app/` → Cloudflare Pages `heartbeat-app` |
| Game core | C# (`net10.0`) compiled to WebAssembly | `game/HeartBeat.Game.{Core,Wasm,Tests}` |
| Fight scene | Phaser 2D, a worker, typed protocol | `app/src/features/eve-garden/` |
| Mascots | three.js over SVG fallbacks, lazy chunk | `features/pet/mascots/3d/` |
| Backend | Pages Functions + a Worker + D1 (+R2 photos) | `app/functions/`, `worker/` |

`APP_BASE=/ npm run build` needs the .NET SDK and the `wasm-tools` workload.

## Layering rule (strict)

- `app/src/domain/**` — pure TypeScript: no React, no Dexie, no `fetch`. Every
  module has a `*.test.ts` beside it. Vitest collects `*.test.ts` only; **components
  are not unit-tested by design**, so any rule that matters must live in `domain/`.
- `app/src/db/repository/**` — the only door to the database; `features/` never
  touches Dexie. Adding a section = new file + one `export *` in alphabetical order.
- `app/src/features/**` — screens; call repository and domain, hold no rules.
- **The scene only draws.** `domain/` decides what a move or skill *is*;
  `scene/` decides what it *looks like*. Phaser never talks to the game worker and
  nothing in `scene/` imports from `engine/` (`scene/events.ts` header).

## Decisions

| Concern | Decision | Why |
|---|---|---|
| Calm plan | Pure `domain/scene/strikePlan.ts`, same contract as `levelUpPlan`: calm ⇒ all zeros | Testable without Phaser; `levelUpAnimator.ts` and `chest/animator.ts` already work this way |
| Timer | Pure `domain/study/clock.ts` (`start`/`pause`/`resume`/`elapsed`) + 4-line `pwa/useElapsed.ts` | Mirrors `domain/feedback/haptics.ts` vs `pwa/haptics.ts` |
| Effect table | `MOVE_VFX[themeId][move] → { shape, palette, count, timing }` in `scene/vfx.ts` | Reuses the five shapes; ten hand-animated effects were already rejected there |
| Accent | Read the theme accent once at scene creation, alongside `applyLighting` | The scene already relights per theme/hour |
| Level-up reveal | Extend `domain/pet/levelUp.ts`: `isBigLevelUp` covers every `MilestoneKind`; a pure `levelUpReveal(seen, now)` returns the milestones crossed | Reads `milestonesAt`, so moving a milestone moves the reveal |
| Partner sees level-up | No sync work: level is derived from the shared pet's XP (`levelProgress(pet.xp).level`) against a local `hb.petLevelSeen` | Already how the built feature works |

## Rules that bite (from `CLAUDE.md`)

- **`study/index.html` goes stale on any change reachable from `standalone.tsx`**
  (styles and scene/theme code included). Run `npm run study:build` **last**.
- **`Rarity` is `Tier`**; ids like `horse-godly` are deliberately unchanged.
- **Mascots:** code under `mascots/3d/` makes no value imports from outside `3d/`
  other than `three`, or three.js gets preloaded on every boot (Lighthouse fails it).
  One WebGL context for all mascots; never give a mascot its own renderer.
- **Skill VFX:** `companionSkills.ts` names a `vfx`, `scene/vfx.ts` maps it to a
  shape, `vfx.test.ts` fails in both directions. The kit files must not contain a
  rights-holder's name (existing guard in `companionSkills.test.ts`, `pets.test.ts`,
  `mascots/roster.test.ts`).
- **Raid Gate:** every effect reading `client.current` must also list `companion`
  in its deps.
- **Nothing in a Dexie transaction may `await` a non-Dexie promise.**
- **Never call `loadSettings()` inside a `useLiveQuery` callback.**
- **Day keys use the member's timezone**, never UTC.
- **Fights stay winnable uncharged and ungeared** (`IslandTests`).
- `localStorage` access is wrapped in try/catch; never put the seen-level in `Settings`.

## Constraints

- Offline-first PWA; precache budget asserted by `app/tools/lighthouse.mjs` off the
  built `sw.js` (882 KB / 12 entries at the last audit).
- Phaser and the 3.5 MB wasm runtime must not boot for screens that don't need them.
- No new dependency without a reason the repo's "bundles nothing third-party"
  stance can live with.

## Verification gate (every phase, before a push)

`npm run typecheck` · `npm run check:config` · `npm run ui:check` · `npm test`
(app + worker + `game:test`) · `APP_BASE=/ npm run build` · `npm run visual`
(axe fails on serious/critical; delete the untracked baseline frames, don't commit)
· `npm run lighthouse` · `npm run study:build` last.

---

<!-- ===== 03_APP_FLOW.md ===== -->
# 03 · App Flow

Only two flows change. Everything else keeps its current route and behaviour.

## Flow 1 — A fight round (Phases B and C)

Entry: Raid Gate (pick a companion) → garden → walk into a monster → fight opens.
The page owns the fight (React owns the wasm worker); the scene is told what to draw.

```
Player taps a move in ActionBar
  → game.playerMove()                        (C# prices the turn; returns BattleDto)
  → move = moveKeyFor(action.style)          physical | defensive | magic | mend
  → fireSkill(kit, move, context)            may add the companion's signature/support skill
      if fires: setFlourish(name); scene.skill(vfx)           ← already shipped
  → scene.strike('player-hits', edge,
                 { move, kit: kit.themeId })                  ← Phase C: was (blow, edge) only
  → battle log line + live region: "<Move name> — <effect>, <weak|plain|strong> hit"
  → if monster still standing: TURN_GAP_MS → game.monsterMove()
  → scene.strike('monster-hits', 'plain')
  → outcome != Fighting → finish(): victory banner / defeat / withdraw
```

Code: `features/eve-garden/EveGardenPage.tsx` (~lines 545–590: skill at 563, strike at
568, monster at 582), `scene/BattleGardenScene.ts` (`strike` ~255, `skill` ~309),
`scene/events.ts` (`SceneHandle`), `scene/game.ts:80`.

**Calm path (Phase B):** `calm` (from `useTheme()`, `EveGardenPage.tsx:121`) or
`prefers-reduced-motion` ⇒ `strikePlan` returns zeros ⇒ `strike`/`skill` resolve after
one still frame, no tween, no delay. The log line and live-region text are identical.

**Edge cases:** a move with no mapped effect falls back to `FALLBACK_SHAPE = 'burst'`
(existing). `mend` is not one of the 15 (it is a heal, not an attack) and keeps the
`motes` shape. Backgrounding mid-fight uses the existing `pause()`/`resume()`.
A fight must never depend on animation completing to advance.

## Flow 2 — A level-up (Phase E)

Level-up is **derived on Home** and is already built; Phase E extends it.

```
Home mounts / pet XP changes
  → level = levelProgress(pet.xp).level           (pet's 50-rung curve, not combat rank)
  → seen  = localStorage hb.petLevelSeen          (null ⇒ record, play nothing)
  → levelUpSince(seen, level) → level | null
  → crossed = milestonesAt(l) for every l in (seen, level]          ← Phase E
  → plan = levelUpPlan({ calm, big: crossed.length > 0 })            ← big for EVERY kind
  → animator.run()  (hop + glow + bar sweep)  then the greeting pose
  → reveal line: "<milestone.name> — <milestone.blurb>"  via the toast host   ← Phase E
```

Both phones get this independently because the level derives from the shared pet.
Several levels at once ⇒ one animation ending on the final level, and the reveal
lists what opened (cap the visible lines, announce all).
**Calm:** no motion; the reveal line and the updated `Lv N` still appear.
**Sound:** only for a level-up seen live while Home is open (existing rule).

## Flow 3 — Quiz question (Phase A)

```
Question shown → clock = start(now)
visibilitychange: hidden → pause(clock, now); visible → resume(clock, now)
tick (only while visible): elapsed(clock, now) → countdown / score
```
`pause` on a paused clock and `resume` on a running one are no-ops; `elapsed` is
monotonic. Resuming continues the question; it does not restart it.
Code: `features/study/StudyPage.tsx:453` (the bare `setInterval(..., 200)`; `plan.md` and `CURRENT_STATE.md` still say :457, which has drifted).

---

<!-- ===== 04_UIUX.md ===== -->
# 04 · UI/UX Design Brief

Keep Heartbeat's look: five theme packs × light/dark, each with its own mascot and
accent. **Do not introduce new colours outside the theme tokens.** New effect
palettes must be derived from each pack's tokens so the packs stay distinct
(`docs/design-system.md`, `docs/PULSE.md`).

## The five companions

| Theme id | Companion | Signature skill (vfx) | Support skill (vfx) | Existing shape |
|---|---|---|---|---|
| `pony` | Wishbell | Star Missile (`horn-bolt`) | One Wish Spare (`held-spark`) | bolt / motes |
| `avatar` | Cirrus | `ring-of-wind` | `rising-current` | ring / motes |
| `sponge` | Marigold | `braced-stance` | Swell (`swell`) | shield / ring |
| `kitty` | Mochi | `lantern-vigil` | `ribbon-coil` | motes / ring |
| `shinobi` | Foxglove | `ink-flare` | `ink-split` | burst / bolt |

(Only Wishbell's skill names were read in full; the other names above are vfx keys.
Read `companionSkills.ts` before writing copy.)

## The 15 effects (Phase C) — hybrid art

Existing motions (`scene/vfx.ts`): `bolt` (travels the gap), `ring` (opens around),
`shield` (held in front), `motes` (rises), `burst` (bloom at a point).
Named for the *motion*; **colour, count and timing carry whose it is**.

| Move | What it should read as | Default motion | Variation per companion |
|---|---|---|---|
| Physical | something crosses the gap and lands | `bolt` | shape of the projectile (hoof-stamp / wind streak / splash / paw / ink stroke), speed, trail |
| Defensive | something held in front of you | `shield` | arc width, colour, how it dissolves |
| Magic | something opens or blooms | `ring` / `burst` | particle count, palette, sparkle vs smoke vs bubbles |

Each of the five fills the 3 × 3 grid of (shape, palette token, count, timing);
no two companions share a palette-and-motion pair for the same move. **Hybrid:**
add one bespoke signature piece per companion (their signature skill's landing),
drawn from Phaser primitives or a small lazy sprite — decision open in
`00_HANDOFF.md`.

**Originality:** characters are the five originals in `features/pet/mascots/`.
No rights-holder names, marks or recognisable likenesses anywhere; the existing
guard tests enforce it for the kit files — extend them to any new art file.

## Accessibility rules (required)

- **Colour is never the only signal.** Every effect also has a log line naming the
  move and effect, and a live-region announcement (`aria-live="polite"`, the
  pattern `BattleLog.tsx` already uses).
- **Contrast:** every new palette must clear AA in both modes against the scene
  and the scrim; extend the `mood.test.ts`-style proof to 5 packs × 2 modes × the
  new tokens. Verify the dim/secondary text specifically.
- **Reduced motion / calm:** zero tweens, zero added delay; information unchanged.
  Flashing: no more than 3 flashes per second (WCAG 2.3.1) — the hurt flash is a
  single bright-and-return; keep it that way.
- **Keyboard:** every move reachable without a mouse (the action bar buttons and
  the labelled `DirectionPad` already are; verify the Raid Gate and map).
- **Screen reader:** fight state, results and the level-up reveal are announced;
  decorative glyphs are `aria-hidden`.
- **Text size:** not found in settings; a user font-size control is a candidate
  (Phase F) and must not break the fight layout at 200% zoom.
- **Touch targets:** at least 24 × 24 px (WCAG 2.2 AA), larger for the move bar.

## Level-up reveal (Phase E)

One line on Home under the `Lv N` bar: `<milestone.name> — <milestone.blurb>`, from
`MILESTONES`, using `MILESTONE_KIND_NAMES` for the category. Tone: short, concrete,
never "well done" — the file's own rule is that a level that only says so is a
notification. Calm shows the same text without motion.

## Wellness framing (Phase D)

Copy and ordering, not a new system: person-first verbs ("you moved", "you rested")
before pet verbs. A single "today" ring is an **open question**; the charges it
would show already exist (`domain/rpg/charges.ts`; `ChargeMeter` in the garden;
`rested` / `grateful` / `ateWell` flags on `MoodEntry`). The garden has no logging
controls and must not gain any.

---

<!-- ===== 05_SCHEMA.md ===== -->
# 05 · Backend Schema

## This round: no schema change

| Area | Change | Why none is needed |
|---|---|---|
| Fight effects | None | `strike()` gains two arguments; nothing is stored |
| Calm / accent | None | Both come from the existing theme context |
| Quiz timer | None | `clock.ts` state lives in the component |
| Level-up reveal | None | Derived from `levelProgress(pet.xp)` and `MILESTONES`; "last shown" is local `hb.petLevelSeen` |
| Partner sees level-up | None | The level derives from the **shared** pet, so both phones cross the same boundary |
| Locked goals (Phase D) | None | Reads lifetime totals that already exist |

## Why no new holding kind

A new kind is **four edits plus a migration**: `HOLDING_KINDS` (client), `KINDS`
(`app/functions/api/holdings.ts`), the D1 `CHECK` (rebuild the table; SQLite cannot
alter one), and a `storeFor` case; `worker/src/holdings.test.ts` holds all four in
step. `PARTNER_WRITABLE_KINDS` is a security list; `PARTNER_VISIBLE_KINDS` is a
display list. Nothing this round needs to cross devices that doesn't already.

## Data each feature reads (all existing)

| Need | Source |
|---|---|
| Pet XP / level | `db/repository/petXp.ts`, `/api/pet`; curve in `domain/xp.ts` (`MAX_LEVEL` 50) |
| What each level opens | `domain/rpg/milestones.ts` (`MILESTONES`, `milestonesAt`, `nextMilestone`) |
| Loyalty tier / next tier | `domain/rpg/together.ts` (`nextTier`, `pointsToNext`); rendered today by `features/pet/TogetherPanel.tsx` |
| Companion kit | `domain/rpg/companionSkills.ts` (`COMPANION_KITS`, `kitFor`, `fireSkill`, `moveKeyFor`) |
| Today's charges | `domain/rpg/charges.ts`; `MoodEntry.{rested,grateful,ateWell}` (optional, sync with the mood row) |
| Quiz card progress | `domain/study/srs.ts` (`CardProgress`), personal, not partner-writable |

## Adjacent, deferred (need schema; from `docs/AUDIT_ROADMAP.md`)

- **Quests/achievements don't survive device loss** — a new D1 table plus API, same
  shape as `holdings.ts`. Own PR.
- **Data export** of a couple's record — read-only, keyed by `coupleId`.

## Privacy

Nothing here adds an email, an account, a new token, or data that leaves a device.
The study bridge keeps its scoped token exactly as stored today.

---

<!-- ===== 06_IMPLEMENTATION_PLAN.md ===== -->
# 06 · Implementation Plan

Six phases, each independently shippable and revertible. **One branch, one PR and
one fresh session per phase**, in the order spec → plan → build → test → you review.
Do not start a phase until the previous one meets its "Done when".
Tests come before code for every pure module. One small commit per numbered step;
stop at each checkpoint. Close each session with the `/ponytail` skill.

Numbering note: these letters replace the "Phase 1/2/3" numbering in `plan.md` and
`docs/WELLNESS_GAME_PLAN.md`, which collided. See `MERGED_PLAN.md` §1 for the map.

## Step 0 — audit before feature code (read-only, ~15 min)

- Run what was not run while planning: worker tests, `npm run game:test`,
  `npm run check:config`, `npm run ui:check`.
- Read `companionSkills.ts` for the exact skill names (only Wishbell's were read).
- Read what `BattleLog` prints per turn and where `battle.log` text comes from in C#.
- Confirm whether `app/tools/visual.mjs` reaches the garden route under axe.
- Done when: a one-page note says which assumptions in these docs were wrong.

## Round 1

### Phase A — Quiz timer pauses when hidden (plan.md Phase 1)
1. **You first:** write `clock.test.ts` cases — unbalanced pause/resume, `elapsed`
   never goes backwards, pause-on-paused is a no-op.
2. `domain/study/clock.ts` (pure): `start`, `pause`, `resume`, `elapsed`.
3. `pwa/useElapsed.ts`: subscribe to `document.visibilitychange`, tick while visible.
4. `StudyPage.tsx:453`: replace the bare interval; timer stays per question.
- Decision (plan.md): a paused question **resumes, never restarts** (restarting
  would let you farm the speed bonus by backgrounding). Don't cap the pause.
- Done when: backgrounding mid-question and returning leaves the countdown where
  it was; `clock.test.ts` green; `npm test` + `typecheck` green. No `styles.css`
  change, so no `study:build` — but run it anyway if anything reachable from
  `standalone.tsx` moved.

### Phase B — Fight scene: calm and accent
1. **You first:** write `strikePlan.test.ts` (mirror `levelUpAnimator.test.ts`):
   calm ⇒ all zeros; non-calm totals under a stated ceiling.
2. `domain/scene/strikePlan.ts`: `strikePlan({ calm, kind })`.
3. `BattleGardenScene.ts`: accept `calm` (plus read `prefers-reduced-motion`);
   `strike`/`skill` resolve after one still frame under calm. Add a `calm` setter or
   creation arg to `SceneHandle` in `events.ts` and pass it from `EveGardenPage.tsx:121`.
4. Replace `const accent = 0xffffff` (`skill()` ~318) with the theme accent, read once
   at creation beside `applyLighting`.
- Done when: under calm a fight round plays no tween and adds no delay; accent
  follows the pack; `strikePlan.test.ts` green; `npm run visual` axe clean.

### Phase C — Per-move, per-companion effects (hybrid)
1. **You first:** sketch one companion's three effects as shape + palette token +
   count + timing.
2. `events.ts`: `strike(blow, effectiveness, { move, kit })`; update `game.ts:80`
   wrapper and the two call sites (`EveGardenPage.tsx:568`, `:582`).
3. `scene/vfx.ts`: `MOVE_VFX[themeId][move]` ×15; extend `vfx.test.ts` two-way
   (every kit × move has an entry; every entry is reachable).
4. Palettes from theme tokens; extend the contrast proof to 5 packs × 2 modes.
5. Battle log / live region names the move and effect (check C# `battle.log` first;
   only add TS text where C# doesn't already say it).
6. Bespoke signature piece per companion: primitives first; sprites only if
   primitives can't carry it, and then lazy, outside the entry chunk and precache.
7. Extend the originality guard tests to any new art file.
- Done when: 15 distinguishable effects across the five companions; no two share a
  palette-and-motion pair for the same move; calm shows none of the motion and all of
  the information; Lighthouse confirms no three.js/Phaser leak into the entry chunk.

## Later rounds (planned, not started)

### Phase D — Visible goals and wellness framing
- Remaining from `plan.md` Phase 2: `domain/rpg/unlocks.ts` (declarative; `progress`
  0–1 defined **before** eligibility) and a locked-goals card with exact numbers.
  (`TogetherPanel` already shows next tier and points-to-go — don't rebuild it.)
  Candidate unlocks: Shared Aura @ Rooted (1200), Chronicle Archive @ 50 study
  sessions, Ascendant stage @ pet level 21+, Evergreen Frame @ 2600.
- Wellness copy pass: person-first strings. Decide the "today ring" question.
- `styles.css` will change ⇒ `npm run study:build`, commit `study/index.html`.
- Done when: `unlocks.test.ts` pins thresholds and monotonic, clamped progress; a
  fresh install shows a locked goal with a real number; nothing subtracts or counts down.

### Phase E — Level-up reveal
1. Update `docs/superpowers/specs/2026-09-24-levelup-moment-design.md` decisions
   table first (text reversal, all kinds big).
2. `domain/pet/levelUp.ts`: `isBigLevelUp` covers every `MilestoneKind`; add a pure
   `levelUpReveal(seen, now)` returning the crossed milestones. Tests first.
3. `features/pet/useLevelUpMoment.ts` + Home: one reveal line, announced via the toast
   host; `LEVEL_UP_TIMING.big` stays under 1.6 s.
- Done when: every milestone kind plays the big moment; the line names what opened;
  calm shows the text without motion; manual check with `hb.petLevelSeen` set low.

### Phase F — Accessibility sweep and nursing decks
- **Accessibility:** keyboard-only garden and Raid Gate; VoiceOver (iOS is the install
  target); 200% zoom and 320 px on every route; a font-size setting if absent; add
  the garden to the axe walk if missing; contrast for every new palette.
- **Nursing decks** (`plan.md` Phase 3): settle the `why` decision first; build-time
  adapter, content-derived stable card ids, test id stability across re-import;
  check bundle size before/after. GLB viewer stays deferred (31 MB, never precached).
- Done when: each item has a recorded manual pass, not just axe (axe covers roughly a
  third of WCAG issues).

## Adjacent backlog (from `docs/AUDIT_ROADMAP.md`, not part of this round)

Visual-regression baselines from a green CI `visual-frames` artifact · sync quests
and achievements · data export · weekly note via `/api/ask` · confirm Lighthouse
fails on score regressions, not only the precache budget.

## Learning checkpoints

| Phase | You do this yourself first | What it teaches |
|---|---|---|
| A | The `clock.test.ts` cases | Pure state machines, unbalanced events |
| B | The `strikePlan.test.ts` cases | "Calm means zero" as a testable contract |
| C | One companion's effects on paper | Design constraints: five shapes, colour carries identity |
| D | Rewrite three strings person-first | Copy as design |
| E | What the reveal says at level 7 and level 40 | Reward pacing |
| F | One keyboard-only garden run | What axe can't see |

## Risks

| Risk | Mitigation |
|---|---|
| Rebuilding what exists | Grep `domain/` for the nouns first (Step 0); this plan found two already shipped |
| three.js / Phaser leaks into the entry chunk | Keep scene code under `scene/`; Lighthouse fails the build |
| `study/index.html` drifts | `study:build` last, every time |
| Effects too similar at 16 px | Differ by motion, colour and count, not detail |
| Bespoke art adds precache weight | Primitives first; lazy sprites only if needed |
| Level-up reveal feels like a notification | Only name what opened; no "well done" |

---

<!-- ===== MERGED_PLAN.md ===== -->
# Merged plan — how the planning docs relate

Four planning/audit documents exist. None is deleted. This file says which parts
of each stay current, which were wrong, and how their phase numbers map.

| Doc | Origin | Role now |
|---|---|---|
| `plan.md` | In-browser session, branch `claude/heartbeat-v2-upgrade-plan-o65x00` | v2 plan: timer, goals, nursing decks. **Stays**, updated by §2 |
| `docs/CURRENT_STATE.md` | Same session | The economy and study-bridge audit. **Stays** as reference |
| `docs/AUDIT_ROADMAP.md` | In-browser session, 2026-09-24 | Whole-app audit. **Stays**; it already records that `plan.md` Phase 2 shipped in a simpler form |
| `docs/WELLNESS_GAME_PLAN.md` | This session (PR #116, closed) | Game-feel audit and first plan. **Stays**, corrected; superseded by `06_IMPLEMENTATION_PLAN.md` |
| `docs/superpowers/specs|plans/` | Earlier sessions | Per-feature specs. The level-up spec needs one decision reversed (Phase E) |

## 1 · Phase map

| Merged | `plan.md` | `WELLNESS_GAME_PLAN.md` | Status |
|---|---|---|---|
| **A** quiz timer | Phase 1 | — | Not built (`clock.ts`, `useElapsed.ts` absent) |
| **B** fight calm + accent | — | Phase 1 | Not built |
| **C** per-move effects | — | Phase 2 | Not built |
| **D** goals + wellness framing | Phase 2 | Phase 4 | **Partly shipped**: `TogetherPanel` shows next tier + points-to-go; `unlocks.ts` and the locked-goals card are not built |
| **E** level-up reveal | — | Phase 3 | Level-up moment **built** (`1fd325a`); reveal line + all-kinds-big not built |
| **F** a11y sweep, nursing decks | Phase 3 / 3b | Phase 5 / §8 | Not built; decks blocked on the `why` decision |

## 2 · What stays, changes, goes

| Item | Disposition |
|---|---|
| Quiz-timer pause (plan.md P1) | **Stays**, verified still missing → Phase A |
| "Nothing renders `nextTier`" (plan.md §2.3, and this session's first grep) | **Wrong now**: `features/pet/TogetherPanel.tsx` renders tier, next tier, points and points-to-go. Only the declarative unlocks + locked-goals card remain |
| Nursing decks, `why` decision, GLB deferral (plan.md P3/3b) | **Stays**, deferred to Phase F |
| Standing rules, dropped/re-aimed list (plan.md §4–5: no Pulse, no `src/game/`, one shared pet) | **Stays verbatim**; the wellness plan agrees with all of it |
| Test baseline "1536 app + 138 worker" (plan.md) | **Update**: app is 2,677 (142 files); worker count not re-run |
| Risk "no security scanning" (plan.md §6) | **Drop**: CodeQL is configured (`docs/CURRENT_STATE.md` traps) |
| Fight findings F1 (same effect for every move), F2 (white accent), F3 (no calm in scene) | **Stays** → Phases B, C. Re-verified in code |
| "Level-up is a hop and a glow; partner sees it via a holdings kind" (wellness doc) | **Corrected**: the moment is specced and built; the partner already sees it because the level derives from the shared pet. No schema, no holding kind |
| Level-up spec "Home only, no on-screen text" | **Reversed by the owner** for the reveal line; Phase E updates the spec |
| "356 `aria-` attributes" (wellness §4) | **Corrected** to ~340; it counted lines |
| "No lint script" (wellness §3) | **Corrected**: no `lint`, but `check:config` and `ui:check` exist; neither was run |
| BattleLog announces move + effect | **Unverified**: it is `aria-live="polite"`; log-line text unread |
| User font-size setting | **Not found** (searched settings/types); unverified |

## 3 · RAG (Red / Amber / Green)

| Area | RAG | Basis |
|---|---|---|
| Types + app tests | **Green** | typecheck clean; 2,677 tests pass |
| Worker / .NET tests, build, visual, Lighthouse | **Amber** | not run while planning |
| Push delivery | **Amber** | crypto pinned to RFC 8291 vectors; real delivery is manual-only |
| Economy, levels, milestones, charges | **Green** | built and tested |
| Level-up moment | **Green** built / **Amber** reveal | reveal line not built |
| Per-move, per-character effects | **Red** | F1, F2: not built |
| Fight canvas accessibility | **Red** | F3: no calm path; log text unverified |
| DOM-screen accessibility | **Green/Amber** | axe gate fails on serious/critical across the walk; manual passes not recorded |
| Quiz timer | **Red** | defect: runs while backgrounded |
| Visible goals | **Amber** | next tier shown; locked-goals card missing |
| Visual-regression pixel diff | **Amber** | baselines not committed (seed-only) |

## 4 · Hand-off

Give Opus `BUILD_PACK.md`. Open questions are listed in `00_HANDOFF.md`.

---
