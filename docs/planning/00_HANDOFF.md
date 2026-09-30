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

1. ~~**Bespoke art method (Phase C)**~~ — **decided: Phaser primitives** (zero
   assets, zero precache cost). Sprites only if primitives cannot carry a piece.
2. **Nursing-deck `why` rationales** (`plan.md` Phase 3): author 126 rationales in
   the study repo (recommended), or make `why` optional for imported cards?
3. **Wellness "today" ring:** is a new Home surface worth it, or does
   `ChargeMeter` (garden) plus a Home pointer to it already say enough?
4. **Level-up spec reversal:** `docs/superpowers/specs/2026-09-24-levelup-moment-design.md`
   decided "Home only, no on-screen text beyond `Lv N`". The reveal line reverses
   that; confirm and update the spec's decisions table when building Phase E.
5. ~~**Worker and .NET tests**~~ — run at the start of Round 1: worker 143 pass,
   `game:test` 264 pass, `check:config` and `ui:check` pass.

## Round 1 progress

**Phases A and B are built** (branch `gng/great-mccarthy-95hpck`). Phase C is next,
in a fresh session. The Step 0 audit changed these assumptions:

- **C# already names the move in the log.** `Battle.cs` writes `"<move> hits for N."`
  using the kit's names (passed in as `MoveNames`), and `BattleLog.tsx` is a polite
  live region. S6 is therefore mostly met; what the text lacks is the weak/strong
  edge, which is decided TS-side (`edgeOf`). That wording is Phase C's to add.
- **`calm` already folds in `prefers-reduced-motion`** (`ThemeProvider.tsx`), so the
  scene reads no media query of its own.
- `levelUpPlan` lives in `features/pet/levelUpAnimator.ts`, not `domain/`.
- The quiz clock also fed the **score** (`elapsedMs` on each answer), not only the
  countdown; Phase A fixed both.
- The scene already reads the theme off its host element in `preload`, so the accent
  is read there too — `StartOptions` gained `calm` but not `accent`.
- `npm run visual` walks home, mood, tasks, shop and settings. **The garden and the
  fight are not in the axe walk** — Phase F should add them.

**Phase C is built** (stacked on the A+B branch). What landed, and what the build found:

- `strike(blow, effectiveness, cast?)` carries `{ move, kit }`; `MOVE_VFX` in
  `features/eve-garden/scene/vfx.ts` holds the 15 looks as shape · token · count · pace.
- **Tokens were measured, not assumed:** every pack's `accent` is 1.71–2.53:1 on its
  light ground and shinobi's `danger` is 1.93:1 in dark. So `effectColours` adds a
  `text` edge to any fill under 3:1, and `vfx.test.ts` proves 15 looks + mend × 5 packs
  × 2 palettes.
- The weakness edge is appended to the player's log line inside the live region, so
  calm keeps it. `edgeOf` never returns `weak`, so there is no weak wording.
- One signature piece per companion in `scene/signatures.ts`, drawn from primitives.
- The originality guard now also reads the three drawing files as text.

**After Phase C (garden tidy):** vertical walking fixed (two tweens on `pet.y`), the
Raid Gate cards are rank + stat bubbles (`statBubbles`), and the fight page lost the
wellness cards, the drawer and the places row — plots moved to `/birb`, chests stay
on the Shop. Phase C itself reached `main` with this change: #118 merged into #117's
branch after #117 had already merged.

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
