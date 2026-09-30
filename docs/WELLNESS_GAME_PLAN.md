# Wellness-game upgrade — audit and draft plan

Written against `gng/happy-gates-2x9n6b`. Facts below were read from the tree
on the day this was written; where something was **not** read, it says so.

**Baseline checked:** `npm run typecheck` clean (app + worker); app suite
142 files / 2,677 tests passing. Worker tests and the .NET game tests were not
re-run for this document.

---

## 0 · Your brief, tightened (and why)

Your original ask was six things in one breath. Splitting them shows which are
*decisions* and which are *checks*, and that changes how you'd brief an agent.

| You wrote | Tightened | Kind |
|---|---|---|
| "Heartbeat shows and starts to orchestrate more of a wellness game feel, not a pet game with a basic RPG layer" | Every wellness action (mood, move, rest, study) must visibly change the game world, and the world must read as a *reward for the habit*, not a separate game. | Direction |
| "Level ups mean more" | A level-up is an **event**: it opens something, says what your habits did to earn it, and is felt on both phones. | Feature |
| "Pet attacks show attack/defence/magic effects, original to each character" | Each of 5 companions × 3 move types = 15 distinct effects, plus the skill flourishes that already exist. | Feature |
| "Full app accessibility" | Audit against WCAG 2.2 AA, then fix the canvas-shaped gaps. | Check → fixes |
| "RAG evaluation" | **Ambiguous — see below.** I read it as Red/Amber/Green status. | Check |
| "Syntax review" | Typecheck + tests + lint pass. Done; see §3. | Check |
| "Draft plan to upgrade and explain the previous text" | This file. | Doc |
| "Also include this doc" (the Lantern Build Pack link) | Read in full (18,359 characters); folded in as §8. | Input |

**Two habits worth keeping for future briefs:** (1) name the *acceptance test*
("a level-up on phone A is seen on phone B within one poll"), because "mean
more" cannot fail; (2) spell out acronyms once — "RAG" has two common meanings
in software and I had to guess.

**RAG assumption.** There is no retrieval-augmented generation layer in this
repo (a search for `RAG`, `retrieval` and `embedding` matched one unrelated
file, `gift/build.mjs`). So §4 is a **Red / Amber / Green** rating. If you meant
retrieval evaluation, tell me — I have not read the Workers AI `ask` endpoint
and would need to before saying what there is to evaluate.

---

## 1 · VAPID keys — the validation steps

The steps already live in `docs/DEPLOY.md` §"The secrets, once" and
`docs/notification-testing.md` §1. In order:

1. **Generate** a P-256 keypair if you have none: `npx web-push generate-vapid-keys`.
2. **Worker gets both keys:**
   `cd worker && npx wrangler secret put VAPID_PUBLIC_KEY` then `…VAPID_PRIVATE_KEY`.
3. **Pages gets the public key only, and it must be the same value:**
   `cd app && npx wrangler pages secret put VAPID_PUBLIC_KEY --project-name heartbeat-app`.
   The private key must **not** exist on Pages.
4. **Preview deploys** need the public key added to the Pages *Preview*
   environment separately (Dashboard → Pages project → Settings → Variables and Secrets).
5. **Validate:** open `https://heartbeat-eop.pages.dev/api/health`. You want
   `"push": true` and a `vapidPublicKey` starting `B…` (65-byte P-256 point,
   about 87 base64url characters). `push:false` or `null` means step 3 was missed.
6. **Watch for a stray newline** — `health.ts` trims the key because one pasted
   with a trailing newline reads as "configured" but fails `pushManager.subscribe`
   with "invalid applicationServerKey".
7. **Prove delivery:** `docs/notification-testing.md` §2 — the two-phone matrix
   on Home-Screen installs. CI cannot do this.

Not verifiable from this container: whether your production secrets are set.
Step 5 is a 10-second check you can do from a phone.

---

## 2 · What the audit found about the game feel

The plan only matters where the code is actually thin. Four findings:

**F1 — Every basic move looks identical.** `EveGardenPage.tsx:568` calls
`scene.strike('player-hits', edge)`. The signature is `(blow, effectiveness)`:
the scene is never told whether the move was physical, defensive or magic, nor
which companion threw it. `companionSkills.ts` already names three moves per
kit (Hoofbeat / Bell Ward / Wishfire…), so the *words* are original per
character and the *picture* is not.

**F2 — The skill flourish is colourless.** `BattleGardenScene.skill()` sets
`const accent = 0xffffff` (line ~318), while its own doc comment and
`vfx.ts` both say "colour carries whose it is". Five shapes (`bolt`, `ring`,
`shield`, `motes`, `burst`) × one colour = ten skills that differ only by motion.

**F3 — The fight scene ignores calm mode.** `grep calm|reduce` over
`eve-garden/scene/` returns nothing; the page reads `calm` only for haptics.
The dashboard level-up and the chest honour it (`levelUpPlan` returns zeros
under calm), so this is a gap in the newest surface, not a policy.

**F4 — Level-up is a hop and a glow.** `levelUpAnimator.ts`: one or two hops, a
glow, a bar sweep, on the Home mascot only. The *content* is already good —
`milestones.ts` gives every level 2–50 something that opens a plot, a skill, a
tether or a stat, and explicitly refuses "well done" messages. What is missing is
the **moment**: the reward is found by looking, not delivered.

**Already strong, do not rebuild:** the milestone ladder, per-kit skill
modifiers, the five-shape VFX table with a two-way test, the charge system that
ties logging to fight damage, the holdings sync for partner visibility.

---

## 3 · Syntax / quality review

| Check | Result |
|---|---|
| `npm run typecheck` (app, functions, worker) | Clean |
| `npm run test --workspace app` | 142 files, 2,677 tests, pass |
| Vite warning | `decks.test.ts` uses ``import(`./${name}.ts`)`` in its own directory; harmless but noisy. Move the decks under a sub-path or make the pattern specific. |
| Lint | Not run — no lint script at the root `package.json` that I read. |
| Worker tests, `game:test` (.NET) | Not run for this document. |

The code reviewed reads consistently with `CLAUDE.md` (comment density, layering
rules). No syntax problems found; the review finding is design, not syntax (§2).

---

## 4 · RAG (Red / Amber / Green) rating

| Area | RAG | Why |
|---|---|---|
| Type safety, tests | **Green** | Clean typecheck, 2,677 tests. |
| Push delivery | **Amber** | Crypto pinned to RFC vectors; real delivery is manual-only and keys are unverifiable from CI. |
| Game economy & levels | **Green** | Milestones, XP bands, charges, tests all in place. |
| Per-move, per-character attack effects | **Red** | F1, F2 — the requested feature is not built. |
| Level-up as an event | **Amber** | Content Green, presentation thin (F4). |
| Accessibility — DOM screens | **Green/Amber** | axe gate on every route in two themes, fails on serious/critical; 356 `aria-` attributes; `aria-live` battle log; labelled pad. |
| Accessibility — the fight canvas | **Red** | No calm path (F3); the canvas conveys hits, weakness and skill effects visually only. The `aria-live` battle log covers the text, but only if it names the *move and effect*, which I did not verify. |
| Accessibility — known limits | **Amber** | axe catches about a third of WCAG issues; nothing in CI covers keyboard-only play of the garden, 200% zoom, or a screen-reader pass. |
| Baselines for visual regression | **Amber** | Not committed yet (`docs/design-system.md`); comparison is seed-only. |

---

## 5 · The plan

Sequenced so each phase ships and reverts alone. Rules go in `domain/` with
tests; the scene only draws (the repo's existing boundary).

### Phase 1 — Fix what is broken (small, do first)
- Pass `calm` into the scene; under calm, `strike`/`skill` resolve after a
  single still frame (same contract as `levelUpPlan`: zero motion, zero delay).
  Also honour `prefers-reduced-motion` directly.
- Replace `accent = 0xffffff` with the active theme's accent, read once at scene
  creation (the scene already relights; see `applyLighting`).
- Tests: a pure `domain/scene/strikePlan.ts` mirrors `levelUpPlan`, so calm
  behaviour is testable without Phaser.

### Phase 2 — Per-move, per-character effects
- Widen the boundary: `strike(blow, effectiveness, { move, kit })` where `move`
  is `MoveKey` and `kit` the `themeId`. Add to `SceneHandle` in `events.ts`.
- Add `MOVE_VFX: Record<themeId, Record<'physical'|'defensive'|'magic', Shape>>`
  in `scene/vfx.ts`. **15 entries, not 15 drawings** — reuse the five motions
  (the file's own stated reason) and give each companion its own *palette +
  motion variant + particle count*: Wishbell = stars, Cirrus = wind streaks, etc.
- Extend `vfx.test.ts` two-way: every kit × move has an entry; every entry is cast.
- **Originality guard:** the kit tests already forbid rights-holder names. Keep
  it — effects stay in the five originals' own character.
- Announce it: the battle log line names the move and effect
  ("Wishfire — star trail, weak hit") so the canvas is not the only channel.

### Phase 3 — Level-ups that mean more
- A `LevelUpCeremony` built from `milestonesAt(level)`: name what opened, say
  *which habits* got you there (this week's logged days / duo days, from data
  that already exists), and show the next milestone.
- Big moments (plot / skill / prestige, per `MilestoneKind`) get the long
  version; ordinary levels get the short one — mirrors `LEVEL_UP_TIMING`.
- Partner sees it: use the existing holdings channel with a **visible-not-writable**
  kind (per `PARTNER_VISIBLE_KINDS`, which already holds "cheers"). A new kind
  costs four edits plus a migration (`CLAUDE.md`), so prefer extending an
  existing kind first; decide after reading `holdings.ts`.
- Calm: a still card with the same content; no motion, same information.

### Phase 4 — Wellness-first framing
- A single "today" ring (mood / move / rest / study) on Home that feeds the
  garden, reusing `charges.ts` — no new currency (the audit already rejected a
  second one in `CURRENT_STATE.md` §2.2).
- Copy pass: verbs about the person ("you moved") before verbs about the pet.
- Gate: the existing rule that every fight stays winnable with no charges.
  No wellness action may become a *requirement*.

### Phase 5 — Accessibility sweep
1. Keyboard-only playthrough of the garden and the Raid Gate (manual, recorded).
2. Screen-reader pass (VoiceOver on iOS, since that is the install target).
3. 200% text zoom and 320 px width on every route.
4. Contrast for the new accent colours — extend the existing contrast proofs
   (`mood.test.ts`-style) to the Phase 2 palettes, in both modes.
5. Add the garden to the axe walk if `tools/visual.mjs` does not already reach
   it (I did not confirm which routes it covers).
6. Targets: WCAG 2.2 AA; touch targets ≥ 24 px; nothing conveyed by colour alone.

### Phase 6 — Ship checks
- `APP_BASE=/ npm run build`, `npm run visual`, `npm run lighthouse`.
- `npm run study:build` **last** (`CLAUDE.md` pitfall — any source change stales it).
- Delete the untracked `app/tools/baselines/` frames; do not commit them.

---

## 6 · Risks and open decisions

1. **Is "RAG" Red/Amber/Green?** Assumed so.
2. **Partner-visible level-ups** need the holdings decision above; it is the
   only part with a schema cost.
3. **Scene payload size.** Phaser and the wasm runtime are lazy on purpose;
   Phase 2 must stay inside `scene/` and add no imports that pull either into
   the entry chunk.
4. **Cost of "original per character".** Distinct palettes and motion variants
   are cheap; bespoke sprite art is not. Decide which you want before Phase 2.

## 7 · Where to learn more (you asked to grow, not just receive)

- Read `features/chest/animator.ts` and `features/pet/levelUpAnimator.ts`
  side by side — they share the "sequence with an end, `run()` never rejects,
  calm means no motion" contract. Phase 1 applies it to a third surface.
- Try writing `strikePlan` yourself before I do: it is ~20 lines, pure, and
  the existing `levelUpAnimator.test.ts` shows the shape of the test.

---

## 8 · The Lantern Build Pack, folded in

**What it is.** A six-document pack (PRD, TRD, App Flow, UI/UX, Schema,
Implementation Plan) for **Lantern**, a *separate* retro-terminal study app. It
specifies three upgrades built in a fixed order: **A** typed recall, **B** merged
Learn mode, **C** typing battles against a CPU bot. I read all of it.

**What it is not.** It is not a Heartbeat spec. Lantern's repo is not in this
session's scope (only `djbatalona06/heartbeat` is), so none of A/B/C can be built
from here. The pack touches Heartbeat in exactly one place, which is where the
two plans meet.

### 8.1 The one integration point — and it is a real gap today

Pack Doc 00 assumes "HeartBeat XP is triggered by a 'session finished' event
that new features should also fire", and C5 wants battle results to feed
Heartbeat XP. In this repo that event is `POST /api/study/session`, and it only
accepts five kinds (`app/functions/api/study/session.ts:32`):

```ts
STUDY_XP = { deck: 20, quiz: 25, weekly: 35, match: 10, anatomy: 15 }
```

An unknown kind is rejected (`session.ts:119`, HTTP 400). So when Lantern ships
Piece A or C and sends `recall` or `battle`, **every session is refused** until
Heartbeat accepts the kind. Nothing in the pack says this; Step 0 of the pack's
own audit should find it from the Lantern side.

**Heartbeat-side work, small and independent (do not wait for Lantern):**
1. Decide kinds and prices, e.g. `recall: 15`, `battle: 20`. Keep them under the
   existing `STUDY_DAILY_CAP = 120` logic — a battle you can rematch endlessly
   must not become an XP faucet; the cap already handles it, and the award id
   `study-<sessionId>` already makes resends safe.
2. Add the kinds plus a test beside the existing session tests.
3. Do **not** change the token model. The pack says "the HeartBeat token stays
   exactly where it is stored now", which agrees with `CURRENT_STATE.md` §4.
4. Privacy agrees too: Lantern stores nothing off-device and Heartbeat stores
   no email — the two promises are compatible.

### 8.2 What the pack teaches that applies to *this* plan

| Pack idea | Applied to the wellness-game plan |
|---|---|
| Build one piece at a time, each with a "Done when" | Phases 1–6 above each get one (below). |
| Order: spec → plan → build → test → you review | Same, one session per phase. |
| Tests before code for pure logic (checker, engine, bot) | `strikePlan`, `MOVE_VFX` and the ceremony builder are pure; write their tests first. |
| Step 0 = read-only audit before feature code | §2 of this file is that audit; it also corrected two assumptions (colour, calm). |
| Accessibility is required, not optional: icon + word for every state, AA contrast, keyboard-only, reduced motion, live-region announcements, user font size | Adopt these as Heartbeat's Phase 5 checklist verbatim. The pack's "Bot is at 60 percent" live-region pattern is the model for announcing *move and effect* in the battle log (F1, Phase 2). |
| A user font-size setting | Not checked in Heartbeat; add to the Phase 5 audit. |
| One small commit per step, checkpoint after each | Adopt. |
| Learning checkpoints: you do the first item yourself | See §8.3. |

### 8.3 Done-when, and your learning checkpoints

| Phase | Done when | You do this yourself first |
|---|---|---|
| 1 Calm + accent | Under calm the fight plays no tweens; accent comes from the theme; `strikePlan` tests pass | Write `strikePlan`'s test cases (mirror `levelUpAnimator.test.ts`) |
| 2 Per-move effects | 15 kit×move entries, two-way test green, battle log names move and effect | Sketch one companion's three effects as shape + colour + particle count |
| 3 Level-up moment | Every `MilestoneKind` renders a card; partner sees it; calm shows the same info still | Decide what the card says for level 7 and level 40 |
| 4 Wellness framing | Fights still winnable with zero charges; copy names the person first | Rewrite three strings from pet-first to you-first |
| 5 Accessibility | Garden playable by keyboard and VoiceOver; AA contrast on new palettes; 200% zoom clean | Do one keyboard-only run of the garden before I do |
| 6 Ship | build, visual, lighthouse green; `study:build` last | — |

### 8.4 Two process conflicts worth settling

- **Branch names.** The pack uses `feat/…` branches; this session is pinned to
  `gng/happy-gates-2x9n6b`. Heartbeat work stays on the pinned branch. Lantern
  work, when it happens, is a different repo and session.
- **PR text.** Your standing rule (and the pack's Doc 06) is no Claude name and
  no session IDs in commits or PRs. The session tooling suggests adding both;
  your rule wins, and I will leave them out.
